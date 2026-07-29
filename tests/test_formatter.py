"""Tests for result formatting."""

from primo_mcp_server.formatter import (
    format_record_detail,
    format_search_results,
    format_suggestions,
)
from primo_mcp_server.models import Holding, PrimoRecord, SearchResponse


class TestFormatSearchResults:
    def test_formats_results(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        output = format_search_results(response, "entrepreneurship innovation")
        assert "entrepreneurship innovation" in output
        assert "[1]" in output
        assert "[2]" in output
        assert "[3]" in output

    def test_empty_results_message(self, empty_results_data):
        response = SearchResponse.from_api_response(empty_results_data)
        output = format_search_results(response, "xyzzyplugh99999")
        assert "No results found" in output
        assert "Suggestions" in output

    def test_contains_record_ids(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        output = format_search_results(response, "test")
        assert "Record ID:" in output

    def test_contains_total_count(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        output = format_search_results(response, "test")
        assert "Found" in output
        assert "results" in output


class TestFormatRecordDetail:
    def test_formats_detail(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        output = format_record_detail(response.records[0])
        assert "Title:" in output
        assert "Author(s):" in output
        assert "Year:" in output
        assert "Type:" in output
        assert "Record ID:" in output

    def test_includes_doi(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        record = response.records[0]
        if record.doi:
            output = format_record_detail(record)
            assert "DOI:" in output


class TestFormatSuggestions:
    def test_formats_suggestions(self):
        output = format_suggestions(["machine learning", "machine vision"], "machine")
        assert "machine learning" in output
        assert "machine vision" in output

    def test_empty_suggestions(self):
        output = format_suggestions([], "xyzzy")
        assert "No suggestions" in output


class TestFormatHoldings:
    def test_lists_holdings_when_present(self):
        record = PrimoRecord(
            record_id="alma993490",
            title="Diseases of the Heart",
            resource_type="book",
            creators=["Bramwell, Byrom"],
            creation_date="1884",
            holdings=[
                Holding(
                    library="Falk Library",
                    library_code="HSLS",
                    location="Rare Books (Non Circulating)",
                    call_number="RC681 B815d 1884",
                    availability_status="available",
                )
            ],
        )
        output = format_record_detail(record)
        assert "Holdings:" in output
        assert (
            "  - Falk Library | RC681 B815d 1884 | "
            "Rare Books (Non Circulating) | available" in output
        )

    def test_omits_holdings_when_none(self):
        record = PrimoRecord(
            record_id="r",
            title="T",
            resource_type="book",
        )
        assert "Holdings:" not in format_record_detail(record)
