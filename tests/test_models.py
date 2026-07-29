"""Tests for Primo PNX model parsing."""

from primo_mcp_server.models import (
    Holding,
    PrimoRecord,
    SearchResponse,
    _strip_subfields,
)


class TestSearchResponse:
    def test_parse_search_results(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        assert response.info.total > 0
        assert len(response.records) == 3

    def test_parse_empty_results(self, empty_results_data):
        response = SearchResponse.from_api_response(empty_results_data)
        assert response.info.total == 0
        assert len(response.records) == 0

    def test_record_has_title(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        for record in response.records:
            assert record.title != ""

    def test_record_has_creators(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        for record in response.records:
            assert len(record.creators) > 0

    def test_record_has_type(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        for record in response.records:
            assert record.resource_type == "article"

    def test_record_has_record_id(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        for record in response.records:
            assert record.record_id != ""

    def test_peer_reviewed_detected(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        # At least one record should be peer-reviewed
        assert any(r.peer_reviewed for r in response.records)


class TestPrimoRecord:
    def test_from_minimal_doc(self):
        """Test parsing with minimal/missing fields."""
        doc = {
            "pnx": {
                "display": {"title": ["Test Title"]},
                "control": {"recordid": ["test123"]},
            }
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.title == "Test Title"
        assert record.record_id == "test123"
        assert record.creators == []
        assert record.doi == ""

    def test_doi_extraction(self):
        doc = {
            "pnx": {
                "display": {
                    "title": ["Test"],
                    "identifier": ["ISSN: 1234-5678", "DOI: 10.1234/test"],
                },
                "control": {"recordid": ["test"]},
            }
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.doi == "10.1234/test"


class TestStripSubfields:
    def test_keeps_text_before_first_delimiter(self):
        assert (
            _strip_subfields("Heggie, Jake, 1961- composer.$$QHeggie, Jake")
            == "Heggie, Jake, 1961- composer."
        )

    def test_passes_through_without_delimiter(self):
        assert (
            _strip_subfields("Cushing, Harvey, 1869-1939.")
            == "Cushing, Harvey, 1869-1939."
        )
        assert _strip_subfields("  spaced  ") == "spaced"

    def test_leading_delimiter_drops_subfield_code(self):
        assert _strip_subfields("$$QHeggie, Jake") == "Heggie, Jake"

    def test_keeps_only_primary_form(self):
        assert _strip_subfields("Primary$$QAlt$$YOther") == "Primary"


class TestAlmaSubfieldParsing:
    def test_strips_subfields_from_display_fields(self):
        doc = {
            "context": "L",
            "pnx": {
                "control": {"recordid": ["alma991001"]},
                "display": {
                    "title": ["Meningiomas$$QMeningiomas, their classification"],
                    "creator": ["Cushing, Harvey, 1869-1939.$$QCushing, Harvey"],
                    "contributor": ["Eisenhardt, Louise.$$QEisenhardt, Louise"],
                    "subject": ["Meningioma$$QMeningiomas; Brain$$QBrain neoplasms"],
                    "publisher": ["Charles C. Thomas$$QThomas"],
                },
            },
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.title == "Meningiomas"
        assert record.creators == ["Cushing, Harvey, 1869-1939."]
        assert record.contributors == ["Eisenhardt, Louise."]
        assert record.subjects == ["Meningioma", "Brain"]
        assert record.publisher == "Charles C. Thomas"


class TestPublisherPlace:
    def test_prefers_addata_pub_cop(self):
        doc = {
            "pnx": {
                "control": {"recordid": ["alma993490"]},
                "display": {
                    "title": ["Diseases of the heart and thoracic aorta"],
                    "publisher": ["New York : Appleton & Co."],
                },
                "addata": {"cop": ["New York"], "pub": ["Appleton & Co."]},
            }
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.publisher == "Appleton & Co."
        assert record.publisher_place == "New York"

    def test_splits_display_publisher_on_isbd_delimiter(self):
        doc = {"pnx": {"display": {"publisher": ["New York : Appleton & Co."]}}}
        record = PrimoRecord.from_api_doc(doc)
        assert record.publisher == "Appleton & Co."
        assert record.publisher_place == "New York"

    def test_no_delimiter_is_publisher_only(self):
        doc = {"pnx": {"display": {"publisher": ["Charles C. Thomas"]}}}
        record = PrimoRecord.from_api_doc(doc)
        assert record.publisher == "Charles C. Thomas"
        assert record.publisher_place == ""

    def test_keeps_first_place_when_multiple(self):
        doc = {
            "pnx": {"display": {"publisher": ["London ; New York : Routledge"]}}
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.publisher == "Routledge"
        assert record.publisher_place == "London ; New York"


class TestHoldings:
    def test_parses_delivery_holding(self):
        doc = {
            "context": "L",
            "pnx": {
                "control": {"recordid": ["alma993490"]},
                "display": {"title": ["Held Book"]},
                "delivery": {
                    "holding": [
                        {
                            "mainLocation": "Falk Library",
                            "libraryCode": "HSLS",
                            "subLocation": "Rare Books (Non Circulating)",
                            "callNumber": "RC681 B815d 1884",
                            "availabilityStatus": "available",
                        }
                    ]
                },
            },
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.holdings == [
            Holding(
                library="Falk Library",
                library_code="HSLS",
                location="Rare Books (Non Circulating)",
                call_number="RC681 B815d 1884",
                availability_status="available",
            )
        ]

    def test_no_holdings_is_empty(self):
        doc = {"pnx": {"display": {"title": ["No Holdings"]}}}
        record = PrimoRecord.from_api_doc(doc)
        assert record.holdings == []

    def test_skips_entries_without_library_or_callnumber(self):
        doc = {
            "pnx": {
                "display": {"title": ["T"]},
                "delivery": {
                    "holding": [{"availabilityStatus": "available"}, {}]
                },
            }
        }
        record = PrimoRecord.from_api_doc(doc)
        assert record.holdings == []
