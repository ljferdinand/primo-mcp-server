"""Tests for the Primo HTTP client: direct record lookup and holdings.

The direct full-display endpoint (guest-JWT authed) and the match-only search
fallback are adapted from the SMU fork (aarontaycheehsien); the holding carried
through _merge_direct_delivery is this fork's addition.
"""

import base64
import json
import time

import httpx
import respx

from primo_mcp_server.client import PrimoClient
from primo_mcp_server.config import PrimoConfig

BASE_URL = "https://primo.example.edu/primaws/rest/pub"


def _make_client() -> PrimoClient:
    config = PrimoConfig(base_url=BASE_URL, vid="01TEST_INST:TEST_VIEW")
    http = httpx.AsyncClient(base_url=BASE_URL)
    return PrimoClient(http, config)


def _jwt(exp_epoch: int) -> str:
    """Build an unsigned JWT carrying an exp claim (epoch seconds)."""

    def seg(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{seg({'alg': 'none', 'typ': 'JWT'})}.{seg({'exp': exp_epoch})}."


def _direct_doc(record_id: str, title: str) -> dict:
    """A direct full-display document (top-level delivery, like Primo VE)."""
    return {
        "context": "L" if record_id.lower().startswith("alma") else "PC",
        "pnx": {
            "control": {"recordid": [record_id], "sourcesystem": ["Alma"]},
            "display": {"title": [title]},
        },
        "delivery": {
            "deliveryCategory": ["Alma-P"],
            "availability": ["available_in_library"],
            "holding": [
                {
                    "mainLocation": "Falk Library",
                    "libraryCode": "HSLS",
                    "subLocation": "Rare Books (Non Circulating)",
                    "callNumber": "RC681 B815d 1884",
                    "availabilityStatus": "available",
                }
            ],
        },
    }


@respx.mock(assert_all_called=False)
async def test_direct_fetch_returns_matching_record_with_holdings(respx_mock):
    exp = int(time.time()) + 3600
    respx_mock.get(url__regex=r".+/guestJwt.*").mock(
        return_value=httpx.Response(200, text=_jwt(exp))
    )
    respx_mock.get(url__regex=r".+/pnxs/L/.+").mock(
        return_value=httpx.Response(200, json=_direct_doc("alma991", "Direct Hit"))
    )
    client = _make_client()
    record = await client.get_record("alma991")
    assert record is not None
    assert record.record_id == "alma991"
    assert record.title == "Direct Hit"
    assert len(record.holdings) == 1
    assert record.holdings[0].library == "Falk Library"
    assert record.holdings[0].call_number == "RC681 B815d 1884"
    await client._http.aclose()


@respx.mock(assert_all_called=False)
async def test_refreshes_guest_jwt_once_on_401(respx_mock):
    exp = int(time.time()) + 3600
    respx_mock.get(url__regex=r".+/guestJwt.*").mock(
        side_effect=[
            httpx.Response(200, text=_jwt(exp)),
            httpx.Response(200, text=_jwt(exp + 60)),
        ]
    )
    respx_mock.get(url__regex=r".+/pnxs/L/.+").mock(
        side_effect=[
            httpx.Response(401),
            httpx.Response(200, json=_direct_doc("alma991", "After Refresh")),
        ]
    )
    client = _make_client()
    record = await client.get_record("alma991")
    assert record is not None
    assert record.title == "After Refresh"
    await client._http.aclose()


@respx.mock(assert_all_called=False)
async def test_falls_back_to_match_only_search_when_token_unavailable(respx_mock):
    respx_mock.get(url__regex=r".+/guestJwt.*").mock(
        return_value=httpx.Response(500)
    )
    respx_mock.get(url__regex=r".+/pnxs\?.+").mock(
        return_value=httpx.Response(
            200,
            json={
                "info": {},
                "docs": [
                    {
                        "pnx": {
                            "control": {"recordid": ["alma000"]},
                            "display": {"title": ["Decoy"]},
                        }
                    },
                    {
                        "pnx": {
                            "control": {"recordid": ["alma991"]},
                            "display": {"title": ["Found"]},
                        }
                    },
                ],
            },
        )
    )
    client = _make_client()
    record = await client.get_record("alma991")
    assert record is not None
    assert record.record_id == "alma991"
    assert record.title == "Found"
    await client._http.aclose()


@respx.mock(assert_all_called=False)
async def test_returns_none_rather_than_mismatched_record(respx_mock):
    exp = int(time.time()) + 3600
    respx_mock.get(url__regex=r".+/guestJwt.*").mock(
        return_value=httpx.Response(200, text=_jwt(exp))
    )
    # Direct endpoint yields no usable pnx, forcing the search fallback.
    respx_mock.get(url__regex=r".+/pnxs/(L|PC)/.+").mock(
        return_value=httpx.Response(200, json={"info": {}, "docs": []})
    )
    respx_mock.get(url__regex=r".+/pnxs\?.+").mock(
        return_value=httpx.Response(
            200,
            json={
                "info": {},
                "docs": [
                    {
                        "pnx": {
                            "control": {"recordid": ["alma777"]},
                            "display": {"title": ["Wrong"]},
                        }
                    }
                ],
            },
        )
    )
    client = _make_client()
    record = await client.get_record("alma991")
    assert record is None
    await client._http.aclose()
