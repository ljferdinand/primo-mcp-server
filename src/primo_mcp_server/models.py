"""Pydantic models for Primo PNX response data.

Primo's API returns inconsistent field shapes -- the same field may be
a string, a list of strings, or missing entirely. These models normalise
everything into predictable types.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, field_validator


def _to_list(v: str | list[str] | None) -> list[str]:
    """Normalise a field that may be str, list[str], or None into list[str]."""
    if v is None:
        return []
    if isinstance(v, str):
        return [v]
    return list(v)


def _first_or_empty(v: str | list[str] | None) -> str:
    """Extract the first element, or return empty string."""
    items = _to_list(v)
    return items[0] if items else ""


def _strip_subfields(value: str) -> str:
    """Strip Primo "$$"-delimited subfields from an Alma PNX display value.

    Alma local records return authority-controlled display fields carrying
    subfield delimiters, e.g. "Heggie, Jake, 1961- composer.$$QHeggie, Jake",
    where the primary display form precedes the first "$$" and an alternate
    form follows it. Keep the text before the first "$$". If a value leads
    with a delimiter (no primary form), fall back to the first subfield's
    text with its single-character subfield code removed. Values without
    "$$" pass through unchanged.
    """
    idx = value.find("$$")
    if idx == -1:
        return value.strip()
    before = value[:idx].strip()
    if before:
        return before
    rest = value[idx + 2:]
    next_delim = rest.find("$$")
    first_field = rest if next_delim == -1 else rest[:next_delim]
    return re.sub(r"^[A-Za-z0-9]", "", first_field).strip()


class Holding(BaseModel):
    """A physical holding: which library holds an item, where, and its status."""

    library: str = ""
    library_code: str = ""
    location: str = ""
    call_number: str = ""
    availability_status: str = ""


class PrimoRecord(BaseModel):
    """A normalised Primo catalogue record."""

    # Identity
    record_id: str = ""
    source_id: str = ""
    source_system: str = ""

    # Display
    title: str = ""
    resource_type: str = ""
    language: str = ""
    creators: list[str] = []
    contributors: list[str] = []
    publisher: str = ""
    publisher_place: str = ""
    creation_date: str = ""
    source_label: str = ""
    description: str = ""
    snippet: str = ""
    subjects: list[str] = []
    keywords: list[str] = []
    is_part_of: str = ""

    # Identifiers
    identifiers: list[str] = []
    doi: str = ""
    isbn: list[str] = []
    issn: list[str] = []

    # Academic data
    journal_title: str = ""
    volume: str = ""
    issue: str = ""
    start_page: str = ""
    end_page: str = ""
    peer_reviewed: bool = False
    ris_type: str = ""
    authors_structured: list[str] = []

    # Availability
    fulltext_available: bool = False
    delivery_category: str = ""
    holdings: list[Holding] = []

    # Relevance
    score: float = 0.0
    context: str = ""

    @classmethod
    def from_api_doc(cls, doc: dict) -> PrimoRecord:
        """Parse a single document from the Primo /pnxs response."""
        pnx = doc.get("pnx", {})
        display = pnx.get("display", {})
        control = pnx.get("control", {})
        addata = pnx.get("addata", {})
        search = pnx.get("search", {})
        delivery = pnx.get("delivery", {})

        # Extract DOI from identifiers, stripping any trailing "$$" subfield.
        doi = ""
        identifiers = _to_list(display.get("identifier"))
        for ident in identifiers:
            if "DOI:" in ident.upper():
                doi = _strip_subfields(ident.split("DOI:")[-1])
                break

        # Parse creators -- display.creator is often a single semicolon-
        # separated string; split, then strip Alma "$$" subfields per name.
        raw_creators = _to_list(display.get("creator"))
        creators = []
        for c in raw_creators:
            creators.extend(
                _strip_subfields(part) for part in c.split(";") if part.strip()
            )
        creators = [c for c in creators if c]

        # Subjects -- may be semicolon-separated
        raw_subjects = _to_list(display.get("subject"))
        subjects = []
        for s in raw_subjects:
            subjects.extend(
                _strip_subfields(part) for part in s.split(";") if part.strip()
            )
        subjects = [s for s in subjects if s]

        # Keywords
        raw_keywords = _to_list(display.get("keyword"))
        keywords = []
        for k in raw_keywords:
            keywords.extend(
                _strip_subfields(part) for part in k.split(";") if part.strip()
            )
        keywords = [k for k in keywords if k]

        # Contributors
        contributors = [
            _strip_subfields(x) for x in _to_list(display.get("contributor"))
        ]
        contributors = [c for c in contributors if c]

        # Publisher and place of publication. Alma addata carries clean,
        # pre-split fields (pub = publisher, cop = place); prefer them.
        # Otherwise fall back to the combined display.publisher, which uses
        # the ISBD " : " delimiter between place and publisher (e.g.
        # "New York : Appleton & Co."). "$$" subfields are stripped first.
        addata_publisher = _strip_subfields(_first_or_empty(addata.get("pub")))
        addata_place = _strip_subfields(_first_or_empty(addata.get("cop")))
        if addata_publisher:
            publisher = addata_publisher
            publisher_place = addata_place
        else:
            combined = _strip_subfields(_first_or_empty(display.get("publisher")))
            sep = combined.find(" : ")
            if sep != -1:
                publisher_place = combined[:sep].strip()
                publisher = combined[sep + 3:].strip()
            else:
                publisher = combined
                publisher_place = addata_place

        # Physical holdings (owning library, location, call number, status).
        # Present on the direct get_record response (carried into
        # delivery.holding by the client); brief search results carry a
        # lighter delivery block, so this is usually empty there. The nested
        # fields are plain strings in the PNX.
        holdings: list[Holding] = []
        raw_holdings = delivery.get("holding")
        if isinstance(raw_holdings, list):
            for h in raw_holdings:
                if not isinstance(h, dict):
                    continue
                holding = Holding(
                    library=_first_or_empty(h.get("mainLocation")),
                    library_code=_first_or_empty(h.get("libraryCode")),
                    location=_first_or_empty(h.get("subLocation")),
                    call_number=_first_or_empty(h.get("callNumber")),
                    availability_status=_first_or_empty(
                        h.get("availabilityStatus")
                    ),
                )
                if holding.library or holding.library_code or holding.call_number:
                    holdings.append(holding)

        # Peer review
        lds50 = _to_list(display.get("lds50"))
        peer_reviewed = any("peer_review" in x.lower() for x in lds50)

        # Score
        score_raw = _to_list(control.get("score"))
        try:
            score = float(score_raw[0]) if score_raw else 0.0
        except (ValueError, IndexError):
            score = 0.0

        return cls(
            record_id=_first_or_empty(control.get("recordid")),
            source_id=_first_or_empty(control.get("sourceid")) or _first_or_empty(
                control.get("sourceid") if isinstance(control.get("sourceid"), str)
                else (control.get("sourceid", [None]) or [None])[0]
            ),
            source_system=_first_or_empty(control.get("sourcesystem")),
            title=_strip_subfields(_first_or_empty(display.get("title"))),
            resource_type=_first_or_empty(display.get("type")),
            language=_first_or_empty(display.get("language")),
            creators=creators,
            contributors=contributors,
            publisher=publisher,
            publisher_place=publisher_place,
            creation_date=_first_or_empty(display.get("creationdate"))
                or _first_or_empty(addata.get("date")),
            source_label=_first_or_empty(display.get("source")),
            description=_first_or_empty(display.get("description"))
                or _first_or_empty(addata.get("abstract")),
            snippet=_first_or_empty(display.get("snippet")),
            subjects=subjects,
            keywords=keywords,
            is_part_of=_first_or_empty(display.get("ispartof")),
            identifiers=identifiers,
            doi=doi,
            isbn=_to_list(addata.get("isbn")),
            issn=_to_list(addata.get("issn")),
            journal_title=_first_or_empty(addata.get("jtitle")),
            volume=_first_or_empty(addata.get("volume")),
            issue=_first_or_empty(addata.get("issue")),
            start_page=_first_or_empty(addata.get("spage")),
            end_page=_first_or_empty(addata.get("epage")),
            peer_reviewed=peer_reviewed,
            ris_type=_first_or_empty(addata.get("ristype")),
            authors_structured=_to_list(addata.get("au")),
            fulltext_available="fulltext" in str(delivery.get("fulltext", "")),
            delivery_category=_first_or_empty(delivery.get("delcategory")),
            holdings=holdings,
            score=score,
            context=doc.get("context", ""),
        )


class SearchInfo(BaseModel):
    """Pagination and total count info from a search response."""

    total: int = 0
    total_local: int = 0
    total_pc: int = 0
    first: int = 0
    last: int = 0


class SearchResponse(BaseModel):
    """Parsed Primo search response."""

    info: SearchInfo = SearchInfo()
    records: list[PrimoRecord] = []

    @classmethod
    def from_api_response(cls, data: dict) -> SearchResponse:
        """Parse the full /pnxs API response."""
        info_raw = data.get("info", {})
        info = SearchInfo(
            total=info_raw.get("total", 0),
            total_local=info_raw.get("totalResultsLocal", 0),
            total_pc=info_raw.get("totalResultsPC", 0),
            first=info_raw.get("first", 0),
            last=info_raw.get("last", 0),
        )
        records = [
            PrimoRecord.from_api_doc(doc)
            for doc in data.get("docs", [])
        ]
        return cls(info=info, records=records)
