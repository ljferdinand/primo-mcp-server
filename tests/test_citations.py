"""Tests for citation formatting."""

from primo_mcp_server.citations import format_citation
from primo_mcp_server.models import PrimoRecord, SearchResponse


class TestCitations:
    def _make_article(self) -> PrimoRecord:
        return PrimoRecord(
            title="Digital Entrepreneurship in Practice",
            resource_type="article",
            creators=["Smith, John", "Jones, Mary"],
            authors_structured=["Smith, John", "Jones, Mary"],
            creation_date="2023-06-15",
            journal_title="Journal of Business Research",
            volume="150",
            issue="2",
            start_page="100",
            end_page="115",
            doi="10.1016/j.jbusres.2023.001",
            issn=["0148-2963"],
            peer_reviewed=True,
        )

    def _make_book(self) -> PrimoRecord:
        return PrimoRecord(
            title="Innovation Management",
            resource_type="book",
            creators=["Brown, Alice"],
            authors_structured=["Brown, Alice"],
            creation_date="2022",
            publisher="Oxford University Press",
            isbn=["9780198765432"],
        )

    def test_apa7_article(self):
        citation = format_citation(self._make_article(), "apa7")
        assert "Smith, J." in citation
        assert "Jones, M." in citation
        assert "(2023)" in citation
        assert "Digital Entrepreneurship" in citation
        assert "10.1016" in citation

    def test_apa7_book(self):
        citation = format_citation(self._make_book(), "apa7")
        assert "Brown, A." in citation
        assert "(2022)" in citation
        assert "Innovation Management" in citation
        assert "Oxford University Press" in citation

    def test_harvard_article(self):
        citation = format_citation(self._make_article(), "harvard")
        assert "(2023)" in citation
        assert "vol." in citation

    def test_chicago_article(self):
        citation = format_citation(self._make_article(), "chicago")
        assert "Smith" in citation
        assert "Jones" in citation

    def test_ieee_article(self):
        citation = format_citation(self._make_article(), "ieee")
        assert "J. Smith" in citation
        assert "doi:" in citation

    def test_vancouver_article(self):
        citation = format_citation(self._make_article(), "vancouver")
        assert "Smith J" in citation
        assert "Jones M" in citation

    def test_from_live_data(self, search_results_data):
        response = SearchResponse.from_api_response(search_results_data)
        for style in ["apa7", "harvard", "chicago", "ieee", "vancouver"]:
            citation = format_citation(response.records[0], style)
            assert len(citation) > 20
            assert response.records[0].title[:20] in citation


class TestPlaceOfPublication:
    def _book_with_place(self) -> PrimoRecord:
        return PrimoRecord(
            title="Diseases of the Heart",
            resource_type="book",
            creators=["Bramwell, Byrom"],
            creation_date="1884",
            publisher="Appleton & Co.",
            publisher_place="New York",
        )

    def test_apa_drops_place(self):
        assert format_citation(self._book_with_place(), "apa7") == (
            "Bramwell, B. (1884). *Diseases of the Heart*. Appleton & Co."
        )

    def test_harvard_drops_place(self):
        assert format_citation(self._book_with_place(), "harvard") == (
            "Bramwell, B. (1884) *Diseases of the Heart*, Appleton & Co."
        )

    def test_chicago_keeps_place(self):
        assert format_citation(self._book_with_place(), "chicago") == (
            "Bramwell, B. *Diseases of the Heart*. New York: Appleton & Co., 1884."
        )

    def test_ieee_keeps_place(self):
        assert format_citation(self._book_with_place(), "ieee") == (
            "B. Bramwell, *Diseases of the Heart*. New York: Appleton & Co., 1884."
        )

    def test_vancouver_keeps_place(self):
        assert format_citation(self._book_with_place(), "vancouver") == (
            "Bramwell B. Diseases of the Heart. New York: Appleton & Co.; 1884."
        )

    def test_no_place_falls_back_to_publisher_only(self):
        record = PrimoRecord(
            title="Diseases of the Heart",
            resource_type="book",
            creators=["Bramwell, Byrom"],
            creation_date="1884",
            publisher="Appleton & Co.",
        )
        assert format_citation(record, "chicago") == (
            "Bramwell, B. *Diseases of the Heart*. Appleton & Co., 1884."
        )


class TestTerminalPeriod:
    def test_apa_does_not_double_period_ending_publisher(self):
        record = PrimoRecord(
            title="T",
            resource_type="book",
            creators=["Doe, Jane"],
            creation_date="2020",
            publisher="Random House, Inc.",
        )
        assert format_citation(record, "apa7") == (
            "Doe, J. (2020). *T*. Random House, Inc."
        )

    def test_apa_still_adds_period_to_plain_publisher(self):
        record = PrimoRecord(
            title="T",
            resource_type="book",
            creators=["Doe, Jane"],
            creation_date="2020",
            publisher="Uni Press",
        )
        assert format_citation(record, "apa7") == "Doe, J. (2020). *T*. Uni Press."

    def test_chicago_book_does_not_double_author_period(self):
        record = PrimoRecord(
            title="Diseases of the Heart",
            resource_type="book",
            creators=["Bramwell, Byrom"],
            creation_date="1884",
            publisher="Appleton & Co.",
        )
        assert format_citation(record, "chicago").startswith(
            "Bramwell, B. *Diseases of the Heart*."
        )

    def test_chicago_article_does_not_double_author_period(self):
        record = PrimoRecord(
            title="Deep Learning.",
            resource_type="article",
            creators=["Smith, Jane Anne", "Doe, John"],
            creation_date="2021",
            journal_title="Journal of AI",
            volume="12",
            issue="3",
            start_page="45",
            end_page="67",
            doi="10.1/x",
        )
        assert format_citation(record, "chicago") == (
            'Smith, J. A., and Doe, J. "Deep Learning." '
            "*Journal of AI* 12, no. 3 (2021): 45-67. https://doi.org/10.1/x"
        )
