"""Async HTTP client for the Primo REST API."""

from __future__ import annotations

import base64
import json
import time
from typing import Any
from urllib.parse import quote

import httpx

from primo_mcp_server.config import PrimoConfig
from primo_mcp_server.models import PrimoRecord, SearchResponse


class PrimoAPIError(Exception):
    """Raised when the Primo API returns an error."""

    def __init__(self, message: str, status_code: int | None = None):
        self.status_code = status_code
        super().__init__(message)


def _normalise_alma_id(record_id: str) -> str:
    """Strip the Alma "alma" prefix for MMS-ID lookups and matching."""
    rid = record_id.strip()
    return rid[4:] if rid.lower().startswith("alma") else rid


def _record_ids_match(found_id: str, requested_id: str) -> bool:
    """True for exact IDs, or Alma IDs equivalent with/without the prefix."""
    found = found_id.strip()
    requested = requested_id.strip()
    return found == requested or (
        _normalise_alma_id(found) == _normalise_alma_id(requested)
    )


def _jwt_expiry_epoch(token: str) -> float | None:
    """Read the exp claim (epoch seconds) from a JWT payload without verifying."""
    try:
        segment = token.split(".")[1]
    except IndexError:
        return None
    try:
        padding = "=" * (-len(segment) % 4)
        payload = json.loads(base64.urlsafe_b64decode(segment + padding))
    except Exception:
        return None
    exp = payload.get("exp")
    return float(exp) if isinstance(exp, (int, float)) else None


def _merge_direct_delivery(data: dict) -> dict:
    """Map the direct endpoint's top-level delivery block into pnx shape.

    The direct full-display endpoint returns delivery data (including physical
    holdings under delivery.holding[], with a single delivery.bestlocation
    mirror) at the top level rather than inside pnx. Carry it into pnx so the
    shared parser reads availability and holdings the same way it does for
    search results.
    """
    pnx = data.get("pnx")
    if not isinstance(pnx, dict):
        return data
    if pnx.get("delivery"):
        return data
    top_delivery = data.get("delivery")
    if not isinstance(top_delivery, dict):
        return data
    holding = top_delivery.get("holding")
    if not isinstance(holding, list):
        best = top_delivery.get("bestlocation")
        holding = [best] if isinstance(best, dict) else []
    mapped = {
        "delcategory": top_delivery.get("deliveryCategory", []),
        "fulltext": top_delivery.get("availability", []),
        "holding": holding,
    }
    return {**data, "pnx": {**pnx, "delivery": mapped}}


class PrimoClient:
    """Async client for the Ex Libris Primo public API."""

    # A cached guest JWT is refreshed this many seconds before its exp claim,
    # and this lifetime is assumed when a token carries no readable exp.
    _JWT_SAFETY_MARGIN_SECONDS = 300
    _JWT_FALLBACK_LIFETIME_SECONDS = 1800

    def __init__(self, http_client: httpx.AsyncClient, config: PrimoConfig):
        self._http = http_client
        self._config = config
        # Anonymous guest JWT, cached for the direct full-display endpoint.
        self._guest_jwt_token: str | None = None
        self._guest_jwt_expiry: float = 0.0  # epoch seconds; 0.0 = none cached

    async def search(
        self,
        query: str,
        field: str = "any",
        scope: str = "everything",
        sort_by: str = "rank",
        limit: int = 10,
        offset: int = 0,
        resource_type: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        peer_reviewed: bool | None = None,
    ) -> SearchResponse:
        """Search the Primo catalogue.

        Args:
            query: Search terms.
            field: Search field (any, title, creator, sub, isbn, oclcnum).
            scope: "everything" for local + PCI, "catalogue" for local only.
            sort_by: rank, date, or title.
            limit: Number of results (capped at max_results_per_request).
            offset: Pagination offset.
            resource_type: Filter by type (books, articles, journals, etc.).
            date_from: Start year (YYYY).
            date_to: End year (YYYY).
            peer_reviewed: Filter to peer-reviewed items only.

        Returns:
            SearchResponse with parsed records and pagination info.
        """
        cfg = self._config
        limit = min(max(1, limit), cfg.max_results_per_request)
        offset = max(0, offset)

        # Resolve scope to tab + scope params
        if scope == "catalogue":
            tab = cfg.tab_catalogue
            scope_param = cfg.scope_local
        else:
            tab = cfg.tab_everything
            scope_param = cfg.scope_combined

        params: dict[str, Any] = {
            "vid": cfg.vid,
            "tab": tab,
            "scope": scope_param,
            "q": f"{field},contains,{query}",
            "offset": str(offset),
            "limit": str(limit),
            "lang": cfg.language,
            "sortby": sort_by,
            "pcAvailability": "true",
        }

        # Facet filters
        q_include: list[str] = []
        if resource_type:
            q_include.append(f"facet_rtype,exact,{resource_type}")
        if date_from and date_to:
            # Primo uses individual year facets; for range we add each year
            # Actually, Primo supports date range via creationdate facet
            for year in range(int(date_from), int(date_to) + 1):
                q_include.append(f"facet_creationdate,exact,{year}")
        elif date_from:
            q_include.append(f"facet_creationdate,exact,{date_from}")
        if peer_reviewed:
            q_include.append("facet_tlevel,exact,peer_reviewed")

        # Add all qInclude params
        if q_include:
            params["qInclude"] = "|,|".join(q_include)

        data = await self._get("/pnxs", params=params)
        return SearchResponse.from_api_response(data)

    async def get_record(self, record_id: str) -> PrimoRecord | None:
        """Fetch a single record by its Primo record ID.

        Tries the direct full-display endpoint first (guest-JWT authed), then
        falls back to a search that returns a record only when its ID matches
        the request, so a mismatched result is never handed back.
        """
        rid = record_id.strip()
        if not rid:
            return None

        # Preferred path: the direct full-display endpoint (guest-JWT authed).
        direct = await self._get_record_direct(rid)
        if direct is not None:
            return direct

        # Fallback: search-based lookup, returning a record only when its ID
        # verifiably matches the request.
        for tab, scope_param, query in self._record_search_plan(rid):
            params: dict[str, Any] = {
                "vid": self._config.vid,
                "tab": tab,
                "scope": scope_param,
                "q": f"any,contains,{query}",
                "offset": "0",
                "limit": "5",
                "lang": self._config.language,
            }
            data = await self._get("/pnxs", params=params)
            response = SearchResponse.from_api_response(data)
            for record in response.records:
                if _record_ids_match(record.record_id, rid):
                    return record
        return None

    async def suggest(self, query: str) -> list[str]:
        """Get autocomplete suggestions for a search term."""
        cfg = self._config
        params = {
            "vid": cfg.vid,
            "q": query,
            "lang": cfg.language,
        }
        data = await self._get("/suggest", params=params)

        # Extract suggestion texts
        response = data.get("response", {})
        docs = response.get("docs", [])
        return [doc.get("text", "") for doc in docs if doc.get("text")]

    async def get_records(self, record_ids: list[str]) -> list[PrimoRecord]:
        """Fetch multiple records by their IDs."""
        records = []
        for rid in record_ids:
            record = await self.get_record(rid)
            if record:
                records.append(record)
        return records

    # -- Guest JWT + direct record -------------------------------------------

    def _institution_code(self) -> str:
        """Institution code for the guest-token endpoint (VID prefix if unset)."""
        cfg = self._config
        code = getattr(cfg, "institution_code", "") or ""
        if code:
            return code
        i = cfg.vid.find(":")
        return cfg.vid if i == -1 else cfg.vid[:i]

    def _view_id(self) -> str:
        vid = self._config.vid
        i = vid.find(":")
        return vid if i == -1 else vid[i + 1:]

    async def _guest_jwt(self, force_refresh: bool = False) -> str:
        """Return a cached anonymous guest JWT, fetching one when needed."""
        now = time.time()
        if (
            not force_refresh
            and self._guest_jwt_token
            and now < self._guest_jwt_expiry
        ):
            return self._guest_jwt_token

        cfg = self._config
        path = f"/institution/{self._institution_code()}/guestJwt"
        params = {
            "vid": cfg.vid,
            "lang": cfg.language,
            "isGuest": "true",
            "viewId": self._view_id(),
        }
        try:
            response = await self._http.get(path, params=params)
        except httpx.HTTPError as e:
            raise PrimoAPIError(
                f"Could not obtain a Primo guest token from {path}: {e}. "
                "Direct record lookup is unavailable; falling back to search."
            ) from e
        if response.status_code != 200:
            raise PrimoAPIError(
                f"Could not obtain a Primo guest token from {path} "
                f"(HTTP {response.status_code}). Direct record lookup is "
                "unavailable; falling back to search-based lookup.",
                status_code=response.status_code,
            )
        token = response.text.strip().strip('"')
        if not token:
            raise PrimoAPIError(
                "Primo guest token endpoint returned an empty token."
            )

        exp = _jwt_expiry_epoch(token)
        if exp is not None:
            lifetime = max(
                exp - time.time() - self._JWT_SAFETY_MARGIN_SECONDS, 60
            )
        else:
            lifetime = self._JWT_FALLBACK_LIFETIME_SECONDS
        self._guest_jwt_token = token
        self._guest_jwt_expiry = now + lifetime
        return token

    async def _get_record_direct(self, record_id: str) -> PrimoRecord | None:
        """Fetch a record from /pnxs/{context}/{docid}, or None on any failure.

        Tries local (L) context first for Alma/numeric IDs and Primo Central
        (PC) first otherwise, refreshing the guest JWT once on a 401/403. A
        record is returned only when its ID matches the request.
        """
        is_alma_like = (
            record_id.lower().startswith("alma") or record_id.isdigit()
        )
        contexts = ["L", "PC"] if is_alma_like else ["PC", "L"]

        try:
            token = await self._guest_jwt()
        except PrimoAPIError:
            return None

        for context in contexts:
            data = await self._fetch_direct(context, record_id, token)
            if data == "auth":
                try:
                    token = await self._guest_jwt(force_refresh=True)
                except PrimoAPIError:
                    return None
                data = await self._fetch_direct(context, record_id, token)
            if data == "auth" or data is None:
                continue
            doc = _merge_direct_delivery(data)
            record = PrimoRecord.from_api_doc(doc)
            if _record_ids_match(record.record_id, record_id):
                return record
        return None

    async def _fetch_direct(
        self, context: str, record_id: str, token: str
    ) -> dict | str | None:
        """Return the direct doc dict, "auth" for 401/403, or None otherwise."""
        cfg = self._config
        path = f"/pnxs/{context}/{quote(record_id, safe='')}"
        params = {"vid": cfg.vid, "lang": cfg.language}
        headers = {"Authorization": f"Bearer {token}"}
        try:
            response = await self._http.get(
                path, params=params, headers=headers
            )
        except httpx.HTTPError:
            return None
        if response.status_code in (401, 403):
            return "auth"
        if response.status_code != 200:
            return None
        try:
            data = response.json()
        except Exception:
            return None
        if not isinstance(data, dict) or not isinstance(data.get("pnx"), dict):
            return None
        return data

    def _record_search_plan(self, record_id: str) -> list[tuple[str, str, str]]:
        """Search attempts used to resolve a record ID when direct fetch fails."""
        cfg = self._config
        rid = record_id.strip()
        is_alma_like = rid.lower().startswith("alma") or rid.isdigit()
        if not is_alma_like:
            return [(cfg.tab_everything, cfg.scope_combined, rid)]

        normalised = _normalise_alma_id(rid)
        queries = [rid]
        if normalised != rid:
            queries.append(normalised)
        alma_prefixed = (
            f"alma{normalised}" if normalised.isdigit() else normalised
        )
        if alma_prefixed not in queries:
            queries.append(alma_prefixed)

        plan: list[tuple[str, str, str]] = []
        for q in queries:
            plan.append((cfg.tab_catalogue, cfg.scope_local, q))
        for q in queries:
            plan.append((cfg.tab_everything, cfg.scope_combined, q))
        return plan

    async def _get(self, path: str, params: dict[str, Any]) -> dict:
        """Make a GET request to the Primo API."""
        try:
            response = await self._http.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException as e:
            raise PrimoAPIError(
                f"Request timed out after {self._config.request_timeout}s. "
                "The Primo API may be slow or unavailable. Try again shortly.",
            ) from e
        except httpx.ConnectError as e:
            raise PrimoAPIError(
                f"Could not connect to {self._config.base_url}. "
                "Check your network connection and that the Primo API is available.",
            ) from e
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status == 400:
                raise PrimoAPIError(
                    f"Bad request (HTTP 400). Check your search query and parameters.",
                    status_code=400,
                ) from e
            elif status >= 500:
                raise PrimoAPIError(
                    f"Primo API server error (HTTP {status}). "
                    "The service may be experiencing issues. Try again later.",
                    status_code=status,
                ) from e
            else:
                raise PrimoAPIError(
                    f"Primo API returned HTTP {status}.",
                    status_code=status,
                ) from e
        except Exception as e:
            raise PrimoAPIError(
                f"Unexpected error querying Primo: {e}",
            ) from e
