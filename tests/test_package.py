"""Run with: python -B -m unittest discover -s tests -v."""
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from render_html_report import render_html_report as render
from chart_library import extent, render_chart
from encode_image import encode_image
from report_specification import chart_spec, validate_specification
from safe_markup import validate_fragment
from theme import contrast_ratio, load_theme


def content():
    return {
        "meta": {
            "title": "Synthetic validation",
            "period": "FY26",
            "scope": "Illustrative accounts",
            "source": "Synthetic test data",
            "freshness": "Refreshed 7 September 2026",
        },
        "opening": {
            "context": "Account health",
            "headline": "Alpha leads the illustrated change",
            "summary": ["The values in this report are synthetic.", "No business conclusion is implied."],
            "metrics": [{"label": "Accounts", "value": "2", "detail": "Illustrative only"}],
        },
        "datasets": {
            "growth": {
                "columns": [
                    {"key": "account", "label": "Account", "type": "text"},
                    {"key": "gain", "label": "Gain", "type": "number", "decimals": 0},
                ],
                "rows": [{"account": "Alpha", "gain": 3}, {"account": "Beta", "gain": -2}],
            }
        },
        "charts": {
            "growth": {
                "type": "bar", "title": "Synthetic comparison", "unit": "Units",
                "period": "Illustrative period", "caption": "Synthetic test data.",
                "dataset": "growth", "category": "account", "value": "gain",
                "sort": "descending", "decimals": 0,
            }
        },
        "sections": [{
            "id": "growth", "eyebrow": "01 Growth", "navigation_label": "Growth overview",
            "title": "Alpha leads",
            "intro": "This section validates the structured report path.",
            "blocks": [
                {"type": "chart", "chart": "growth"},
                {"type": "insight", "label": "Observed.", "text": "Alpha is larger than Beta."},
            ],
        }],
        "closing": {
            "title": "Validation note",
            "items": [{"label": "Validate", "text": "Reconcile final values before delivery."}],
        },
        "supporting": [{
            "type": "definitions", "title": "Definitions",
            "items": [{"term": "Synthetic", "definition": "Created only for package testing."}],
        }],
    }


def spec(kind="bar"):
    result = {"type": kind, "title": "Synthetic comparison", "unit": "Units",
              "period": "Illustrative period", "caption": "Synthetic test data.",
              "data": [{"label": "A", "value": 3}, {"label": "B", "value": -2}]}
    if kind == "line":
        result.update(x_unit="Year", data=[
            {"label": "2022", "x": 2022, "value": 4, "low": 3, "high": 5},
            {"label": "2023", "x": 2023, "value": None, "low": None, "high": None},
            {"label": "2026", "x": 2026, "value": 6, "low": 5, "high": 7}])
    elif kind == "waterfall":
        result["data"] = [{"label": "Opening", "kind": "total", "value": 10},
                          {"label": "Change", "kind": "change", "value": -4},
                          {"label": "Closing", "kind": "total", "value": 6}]
    elif kind == "stacked":
        result.update(series=["A", "B"], data=[{"label": "First", "values": [1, 3]},
                                                {"label": "Second", "values": [0, 0]}])
    elif kind == "dumbbell":
        result.update(before_label="Prior", after_label="Current",
                      data=[{"label": "A", "before": 3, "after": 7},
                            {"label": "B", "before": None, "after": 5}])
    elif kind == "scatter":
        result.update(x_unit="Distance", data=[{"label": "A", "x": 1, "value": 3, "annotate": True},
                                                {"label": "B", "x": 2, "value": 5}])
    elif kind == "bullet":
        result["data"] = [{"label": "Service", "value": 94, "target": 96,
                           "status": "caution"},
                          {"label": "Quality", "value": 98, "target": 97,
                           "status": "positive"}]
    elif kind == "variance":
        result.update(sort="descending", data=[
            {"label": "North", "value": 7, "status": "positive"},
            {"label": "South", "value": -3, "status": "negative"}])
    elif kind == "histogram":
        result["data"] = [{"label": "0-10", "low": 0, "high": 10, "value": 4},
                          {"label": "10-20", "low": 10, "high": 20, "value": 9}]
    elif kind == "range":
        result["data"] = [{"label": "Base", "low": 80, "high": 120, "value": 102},
                          {"label": "Stretch", "low": 95, "high": 145,
                           "value": 128}]
    elif kind == "heatmap":
        result["data"] = [{"label": "Team A", "x_label": "Week 1", "value": 72},
                          {"label": "Team A", "x_label": "Week 2", "value": 81},
                          {"label": "Team B", "x_label": "Week 1", "value": 64}]
    elif kind == "timeline":
        result.update(x_type="date", data=[
            {"label": "Pilot", "x": "2026-01-15", "detail": "Pilot started"},
            {"label": "Launch", "x": "2026-05-20", "detail": "Launch completed"}])
    elif kind == "scenario":
        result.update(series=["Base", "Upside", "Downside"], style="line", data=[
            {"label": "Q1", "values": [100, 110, 92]},
            {"label": "Q2", "values": [108, 124, 96]}])
    return result


class SpecificationTests(unittest.TestCase):
    def test_specification_rejects_legacy_slots_and_unknown_fields(self):
        with self.assertRaisesRegex(ValueError, "missing keys"):
            validate_specification({"REPORT_TITLE": "Legacy"})
        broken = content()
        broken["legacy"] = True
        with self.assertRaisesRegex(ValueError, "unknown keys"):
            validate_specification(broken)

    def test_minimal_report_omits_optional_scaffolding(self):
        report = {
            "meta": {
                "title": "Compact reference",
                "scope": "Synthetic scope",
                "source": "Synthetic source",
            },
            "sections": [{
                "id": "reference",
                "title": "Reference coverage",
                "blocks": [{"type": "paragraph", "text": "One section is sufficient."}],
            }],
        }
        output = render(report)
        self.assertIn('class="composition-standard"', output)
        self.assertIn('<header class="hero hero-minimal"', output)
        self.assertIn('>Skip to report</a>', output)
        self.assertIn('<section class="report-section"', output)
        self.assertNotIn('class="section-nav"', output)
        self.assertNotIn('class="metric-strip"', output)
        self.assertNotIn('class="closing"', output)
        self.assertNotIn('class="supporting"', output)
        self.assertNotIn('class="eyebrow"', output)

    def test_opening_uses_neutral_headline_contract(self):
        report = content()
        report["opening"] = {"headline": "A neutral orientation"}
        output = render(report)
        self.assertIn('>A neutral orientation</h1>', output)
        self.assertNotIn('class="hero-deck"', output)
        broken = content()
        broken["opening"] = {"conclusion": "Legacy field"}
        with self.assertRaisesRegex(ValueError, "unknown keys"):
            render(broken)
        broken = content()
        broken["charts"]["growth"]["tooltip"] = {"formatter": "<b>{value}</b>"}
        with self.assertRaisesRegex(ValueError, "unknown keys"):
            validate_specification(broken)

    def test_plain_text_is_escaped_once_and_preescaped_text_is_rejected(self):
        report = content()
        report["meta"]["title"] = '<img src=x onerror="probe"> & analysis'
        output = render(report)
        self.assertNotIn("<img src=x", output)
        self.assertIn("&lt;img src=x", output)
        self.assertIn("&amp; analysis", output)
        report["meta"]["title"] = "Bad &amp; escaped"
        with self.assertRaisesRegex(ValueError, "pre-escaped HTML"):
            render(report)

    def test_dataset_rows_match_declared_columns_and_types(self):
        report = content()
        report["datasets"]["growth"]["rows"][0]["extra"] = 1
        with self.assertRaisesRegex(ValueError, "exactly one value"):
            validate_specification(report)
        report = content()
        report["datasets"]["growth"]["rows"][0]["gain"] = "3"
        with self.assertRaisesRegex(ValueError, "finite number"):
            validate_specification(report)

    def test_chart_and_table_share_sorted_dataset(self):
        report = content()
        report["sections"][0]["blocks"].append({
            "type": "table", "dataset": "growth", "title": "Growth detail",
            "columns": ["account", "gain"], "sort": {"key": "gain", "direction": "descending"},
            "search": True,
        })
        normalized = validate_specification(report)
        plotted = chart_spec(normalized["charts"]["growth"], normalized["datasets"])
        self.assertEqual([row["label"] for row in plotted["data"]], ["Alpha", "Beta"])
        output = render(report)
        self.assertIn("data-report-table", output)
        self.assertLess(output.index("Alpha"), output.index("Beta"))
        self.assertIn('data-value="3"', output)

    def test_consecutive_prose_blocks_use_adaptive_group(self):
        report = content()
        report["sections"][0]["blocks"].append({
            "type": "paragraph", "text": "A second related observation."
        })
        output = render(report)
        self.assertIn('<div class="prose-grid"><p class="insight">', output)
        self.assertIn('A second related observation.</p></div>', output)

    def test_rich_text_supports_emphasis_links_and_citations(self):
        report = content()
        report["opening"]["summary"] = [[
            {"type": "text", "text": "The result is "},
            {"type": "strong", "text": "material"},
            {"type": "text", "text": " but "},
            {"type": "emphasis", "text": "not causal"},
            {"type": "text", "text": ". Review the "},
            {"type": "link", "text": "published method", "href": "https://example.com/method?a=1&b=2"},
            {"type": "citation", "label": "1", "href": "https://example.com/source",
             "title": "Synthetic source"},
        ]]
        output = render(report)
        self.assertIn("<strong>material</strong>", output)
        self.assertIn("<em>not causal</em>", output)
        self.assertIn('href="https://example.com/method?a=1&amp;b=2"', output)
        self.assertIn('<sup class="citation"><a href="https://example.com/source"', output)
        self.assertIn("[1]</a></sup>", output)

    def test_rich_text_rejects_active_or_ambiguous_content(self):
        report = content()
        report["sections"][0]["blocks"][1]["text"] = [
            {"type": "link", "text": "unsafe", "href": "javascript:alert(1)"}
        ]
        with self.assertRaisesRegex(ValueError, "explicit HTTPS URL"):
            render(report)
        report = content()
        report["sections"][0]["blocks"][1]["text"] = [
            {"type": "strong", "text": "Already &amp; escaped"}
        ]
        with self.assertRaisesRegex(ValueError, "pre-escaped HTML"):
            render(report)

    def test_lists_and_one_level_subsections_preserve_heading_order(self):
        report = content()
        report["sections"][0]["blocks"] = [{
            "type": "subsection",
            "title": "Primary evidence",
            "intro": "The visual and ordered checks belong together.",
            "blocks": [
                {"type": "chart", "chart": "growth"},
                {"type": "list", "style": "ordered", "items": [
                    "Reconcile the source values.",
                    [{"type": "strong", "text": "Retain"},
                     {"type": "text", "text": " the exception."}],
                ]},
            ],
        }]
        output = render(report)
        self.assertIn('<section class="report-subsection"', output)
        self.assertIn(">Primary evidence</h3>", output)
        self.assertIn("<h4>Synthetic comparison</h4>", output)
        self.assertIn('<ol class="report-list">', output)
        self.assertIn("<li><strong>Retain</strong> the exception.</li>", output)
        nested = content()
        nested["sections"][0]["blocks"].append({
            "type": "subsection", "title": "Outer", "blocks": [{
                "type": "subsection", "title": "Inner",
                "blocks": [{"type": "paragraph", "text": "Too deep."}],
            }],
        })
        with self.assertRaisesRegex(ValueError, "cannot be nested"):
            render(nested)

    def test_controlled_static_figure_accepts_only_bounded_png_or_jpeg(self):
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        report = content()
        report["sections"][0]["blocks"].append({
            "type": "figure", "title": "Specialized static view",
            "image": {"mime_type": "image/png", "base64": png},
            "alt": "One-pixel synthetic image used to validate the figure contract.",
            "caption": [
                {"type": "text", "text": "Generated outside the chart library. "},
                {"type": "citation", "label": "method", "href": "https://example.com/method"},
            ],
        })
        output = render(report)
        self.assertIn('<figure class="report-figure"', output)
        self.assertIn('src="data:image/png;base64,iVBOR', output)
        self.assertIn("Generated outside the chart library.", output)
        report["sections"][0]["blocks"][-1]["image"]["mime_type"] = "image/svg+xml"
        with self.assertRaisesRegex(ValueError, "image/png or image/jpeg"):
            render(report)
        report = content()
        truncated = base64.b64encode(base64.b64decode(png)[:-12]).decode()
        report["sections"][0]["blocks"].append({
            "type": "figure", "title": "Truncated image",
            "image": {"mime_type": "image/png", "base64": truncated},
            "alt": "Invalid test image.", "caption": "This must be rejected.",
        })
        with self.assertRaisesRegex(ValueError, "complete PNG"):
            render(report)
        report = content()
        report["sections"][0]["blocks"].append({
            "type": "figure", "title": "Mislabeled image",
            "image": {"mime_type": "image/png", "base64": base64.b64encode(b"not a png").decode()},
            "alt": "Invalid test image.", "caption": "This must be rejected.",
        })
        with self.assertRaisesRegex(ValueError, "does not match its signature"):
            render(report)

    def test_inline_image_and_bounded_brand_logo_render_from_validated_bytes(self):
        png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        image = {"mime_type": "image/png", "base64": png}
        report = content()
        report["meta"].update(language="fr-CA", logo={"image": image, "alt": "Synthetic mark"})
        report["sections"][0]["blocks"].append({
            "type": "image", "image": image, "alt": "Synthetic one-pixel illustration",
            "title": "Context image", "caption": "Illustrative only.", "width": "wide",
        })
        output = render(report)
        self.assertIn('<html lang="fr-CA">', output)
        self.assertIn('class="brand-logo"', output)
        self.assertIn('class="report-image report-image-wide"', output)
        self.assertEqual(output.count('src="data:image/png;base64,'), 2)

    def test_localized_ui_labels_cover_static_and_dynamic_report_chrome(self):
        report = content()
        report["meta"].update(language="fr-CA", ui_labels={
            "skip_to_report": "Aller au rapport",
            "chart_values": "Valeurs et détail accessible",
            "filters_applied": "Filtres appliqués : {count}.",
            "rows_shown": "{visible} lignes affichées sur {total}",
        })
        output = render(report)
        self.assertIn(">Aller au rapport</a>", output)
        self.assertIn(">Validation note</h2>", output)
        self.assertIn(">Valeurs et détail accessible</summary>", output)
        encoded = re.search(r'data-ui-labels="([A-Za-z0-9+/=]+)"', output).group(1)
        labels = json.loads(base64.b64decode(encoded).decode("utf-8"))
        self.assertEqual(labels["filters_applied"], "Filtres appliqués : {count}.")
        self.assertEqual(labels["rows_shown"], "{visible} lignes affichées sur {total}")

        broken = content()
        broken["meta"]["ui_labels"] = {"rows_shown": "Lignes affichées"}
        with self.assertRaisesRegex(ValueError, "preserve placeholders"):
            render(broken)

    def test_image_encoder_validates_a_local_png_for_direct_embedding(self):
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "brand.png"
            source.write_bytes(png)
            encoded = encode_image(source)
        self.assertEqual(encoded["mime_type"], "image/png")
        self.assertEqual(base64.b64decode(encoded["base64"]), png)

    def test_optional_opening_and_extended_column_types_render(self):
        report = content()
        report.pop("opening")
        report["composition"] = "operational-review"
        report["datasets"] = {"typed": {"columns": [
            {"key": "when", "label": "Date", "type": "date"},
            {"key": "stamp", "label": "Updated", "type": "datetime"},
            {"key": "cost", "label": "Cost", "type": "currency", "currency": "USD", "decimals": 2},
            {"key": "elapsed", "label": "Elapsed", "type": "duration", "duration_unit": "hours", "decimals": 1},
            {"key": "count", "label": "Count", "type": "integer"},
            {"key": "ready", "label": "Ready", "type": "boolean",
             "true_label": "Ready", "false_label": "Blocked"},
        ], "rows": [{"when": "2026-09-12", "stamp": "2026-09-12T14:30:00-05:00",
                     "cost": 1250.5, "elapsed": 3.5, "count": 4, "ready": True}]}}
        report["charts"] = {}
        report["sections"] = [{
            "id": "status", "eyebrow": "Current status", "navigation_label": "Status",
            "title": "Current operating status", "blocks": [
                {"type": "table", "dataset": "typed", "title": "Status detail"}],
        }]
        output = render(report)
        self.assertIn('class="composition-operational-review"', output)
        self.assertIn(">Synthetic validation</h1>", output)
        self.assertIn("USD 1,250.50", output)
        self.assertIn("3.5 hours", output)
        self.assertIn(">Ready</", output)

    def test_section_filters_and_chart_drilldown_share_dataset_semantics(self):
        report = content()
        report["datasets"]["growth"]["columns"].append(
            {"key": "group", "label": "Group", "type": "text"})
        report["datasets"]["growth"]["rows"][0]["group"] = "Current"
        report["datasets"]["growth"]["rows"][1]["group"] = "Prior"
        report["sections"][0]["filters"] = [
            {"id": "group", "label": "Group", "column": "group", "datasets": ["growth"]}]
        report["sections"][0]["blocks"].append({
            "type": "table", "dataset": "growth", "title": "Growth detail",
            "drilldown_from": {"chart": "growth", "column": "account"},
        })
        output = render(report)
        self.assertIn("data-report-filters", output)
        self.assertIn('data-filter-id="group"', output)
        self.assertIn('data-report-drilldown', output)
        self.assertIn('data-chart-definition="growth"', output)

    def test_navigation_and_ids_are_generated_from_sections(self):
        output = render(content())
        self.assertNotIn('class="section-nav"', output)
        self.assertIn('id="section-growth"', output)
        report = content()
        report["sections"].append({
            "id": "second", "title": "A second section", "navigation_label": "Second topic",
            "blocks": [{"type": "paragraph", "text": "More detail."}],
        })
        output = render(report)
        self.assertIn('href="#section-growth"', output)
        self.assertIn('aria-label="Jump to: Alpha leads"', output)
        self.assertIn('>Growth overview</a>', output)
        self.assertIn('>Second topic</a>', output)
        report = content()
        report["sections"].append(dict(report["sections"][0]))
        with self.assertRaisesRegex(ValueError, "must be unique"):
            render(report)

    def test_navigation_labels_are_descriptive_and_unique(self):
        report = content()
        report["sections"][0]["navigation_label"] = "Section 1"
        with self.assertRaisesRegex(ValueError, "must describe the section"):
            render(report)
        report = content()
        report["sections"].append({
            "id": "second", "eyebrow": "02 Second", "navigation_label": "Growth overview",
            "title": "A second section", "blocks": [{"type": "paragraph", "text": "More detail."}],
        })
        with self.assertRaisesRegex(ValueError, "unique navigation label"):
            render(report)
        report = content()
        report["sections"][0].pop("navigation_label")
        report["sections"].append({
            "id": "second", "title": "A second section", "navigation_label": "Second topic",
            "blocks": [{"type": "paragraph", "text": "More detail."}],
        })
        self.assertIn('>Alpha leads</a>', render(report))
        report = content()
        report["sections"][0].pop("navigation_label")
        report["sections"].append({
            "id": "second", "title": "Alpha leads",
            "blocks": [{"type": "paragraph", "text": "More detail."}],
        })
        with self.assertRaisesRegex(ValueError, "unique navigation label"):
            render(report)

    def test_chart_definitions_are_reusable_with_unique_rendered_instances(self):
        report = content()
        report["sections"][0]["blocks"].append({"type": "chart", "chart": "growth"})
        output = render(report)
        self.assertIn('id="chart-growth"', output)
        self.assertIn('id="chart-growth-2"', output)
        self.assertEqual(output.count('data-chart-definition="growth"'), 2)

    def test_local_views_reference_distinct_validated_charts(self):
        report = content()
        report["charts"]["growth-copy"] = dict(report["charts"]["growth"], title="Second view")
        report["sections"][0]["blocks"][0] = {
            "type": "views", "label": "Measure", "default": 1,
            "views": [{"label": "Gain", "chart": "growth"},
                      {"label": "Volume", "chart": "growth-copy"}],
        }
        output = render(report)
        self.assertIn("data-report-explorer", output)
        self.assertIn('aria-pressed="true">Volume', output)
        report["sections"][0]["blocks"][0]["views"][1]["label"] = "Gain"
        with self.assertRaisesRegex(ValueError, "must be distinct"):
            validate_specification(report)

    def test_bar_status_requires_explicit_semantics(self):
        report = content()
        report["datasets"]["growth"]["columns"].append(
            {"key": "status", "label": "Status", "type": "text"})
        for row, status in zip(report["datasets"]["growth"]["rows"], ["positive", "negative"]):
            row["status"] = status
        report["charts"]["growth"]["status"] = "status"
        normalized = validate_specification(report)
        plotted = chart_spec(normalized["charts"]["growth"], normalized["datasets"])
        self.assertEqual([row["status"] for row in plotted["data"]], ["positive", "negative"])
        report["datasets"]["growth"]["rows"][0]["status"] = "green"
        with self.assertRaisesRegex(ValueError, "must be one of"):
            validate_specification(report)
        report = content()
        report["sections"][0]["blocks"] = [block for block in report["sections"][0]["blocks"]
                                                   if block["type"] != "chart"]
        with self.assertRaisesRegex(ValueError, "referenced by at least one"):
            validate_specification(report)


class SecurityTests(unittest.TestCase):
    def test_skill_metadata_allows_selection_only_for_explicit_report_requests(self):
        skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        integration = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
        self.assertIn("name: generate-interactive-business-report", skill)
        self.assertIn("allow_implicit_invocation: true", integration)
        self.assertIn("explicitly asks to create, build, generate, or revise", skill)

    def test_structured_data_cannot_inject_markup(self):
        payloads = ['<script>window.__probe=1</script>', '<svg onload="window.__probe=1">',
                    '<img src=x onerror=alert(1)>', 'javascript:alert(1)']
        for payload in payloads:
            report = content()
            report["datasets"]["growth"]["rows"][0]["account"] = payload
            output = render(report)
            with self.subTest(payload=payload):
                self.assertNotIn("<script>window.__probe", output)
                self.assertNotIn("<svg onload=", output)
                self.assertNotIn("<img src=x onerror=", output)

    def test_safe_markup_still_rejects_active_custom_fragments(self):
        payloads = ['<script>probe()</script>', '<svg onload="probe()"></svg>',
                    '<img src="https://example.invalid/a.png">',
                    '<svg><title><img src=x onerror=alert(1)></title></svg>']
        for payload in payloads:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                validate_fragment(payload)
        safe = '<svg viewBox="0 0 100 40"><title>Safe</title><path d="M0 0 L50 20" fill="none" stroke="#2563eb"></path></svg>'
        self.assertIn('viewBox="0 0 100 40"', validate_fragment(safe))

    def test_csp_hashes_match_packaged_css_and_script(self):
        output = render(content())
        sources = re.findall(r'<script>([\s\S]*?)</script>', output)
        sources += re.findall(r'<style>([\s\S]*?)</style>', output)
        self.assertEqual(len(sources), 4)
        for source in sources:
            digest = base64.b64encode(hashlib.sha256(source.encode()).digest()).decode()
            self.assertIn("sha256-" + digest, output)
        self.assertIn("connect-src &#x27;none&#x27;", output)
        self.assertNotIn("unsafe-eval", output)

    def test_policy_survives_reformatted_shell(self):
        with tempfile.TemporaryDirectory() as tmp:
            package = Path(tmp)
            for name in ["report-shell.html", "report-base.css", "report-charts.js", "report-interactions.js", "theme.json"]:
                shutil.copy(ROOT / name, package / name)
            (package / "vendor").mkdir()
            shutil.copy(ROOT / "vendor" / "echarts.custom.min.js", package / "vendor" / "echarts.custom.min.js")
            shell = (package / "report-shell.html").read_text(encoding="utf-8")
            (package / "report-shell.html").write_text(
                shell.replace("  </style>", "      </style>").replace("  </script>", "      </script>"),
                encoding="utf-8")
            output = render(content(), root=package)
        for source in re.findall(r'<(?:script|style)>([\s\S]*?)</(?:script|style)>', output):
            digest = base64.b64encode(hashlib.sha256(source.encode()).digest()).decode()
            self.assertIn("sha256-" + digest, output)

    def test_interactive_controller_is_always_embedded(self):
        output = render(content())
        self.assertEqual(output.count("<script>"), 3)
        self.assertIn("document.querySelectorAll", output)
        self.assertIn("data-chart-spec", output)
        self.assertNotIn("script-src &#x27;none&#x27;", output)

    def test_check_flag_validates_without_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "report-specification.json"
            target = Path(tmp) / "report.html"
            source.write_text(json.dumps(content()), encoding="utf-8")
            command = [sys.executable, "-B", str(ROOT / "scripts" / "render_html_report.py"),
                       str(source), str(target), "--check"]
            done = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertFalse(target.exists())
            self.assertIn("1 chart(s)", done.stdout)

    def test_static_and_print_code_paths_are_removed(self):
        renderer = (ROOT / "scripts" / "render_html_report.py").read_text(encoding="utf-8")
        css = (ROOT / "report-base.css").read_text(encoding="utf-8")
        controller = (ROOT / "report-interactions.js").read_text(encoding="utf-8")
        self.assertNotIn("--no-interactions", renderer)
        self.assertNotIn("interactive:", renderer)
        self.assertNotIn("@media print", css)
        self.assertNotIn("chart-wide", css)
        self.assertNotIn("chart-narrow", css)
        self.assertNotIn("--bar-width", css)
        self.assertNotIn("beforeprint", controller)

    def test_vendored_chart_runtime_matches_manifest_and_has_notices(self):
        vendor = ROOT / "vendor"
        manifest = json.loads((vendor / "manifest.json").read_text(encoding="utf-8"))
        bundle = (vendor / manifest["bundle"]).read_bytes()
        self.assertEqual(manifest["version"], "6.1.0")
        self.assertEqual(len(bundle), manifest["bytes"])
        self.assertEqual(hashlib.sha256(bundle).hexdigest(), manifest["sha256"])
        for name in ["echarts.LICENSE.txt", "echarts.NOTICE.txt", "LICENSE-d3.txt"]:
            self.assertTrue((vendor / name).is_file(), name)
        source = bundle.decode("utf-8")
        self.assertNotIn("unsafe-eval", source)
        self.assertNotRegex(source, r"\beval\s*\(")
        self.assertNotRegex(source, r"new\s+Function\b")


class ThemeTests(unittest.TestCase):
    def test_packaged_theme_is_valid_and_meets_text_contrast(self):
        theme = load_theme(ROOT / "theme.json")
        self.assertEqual(theme["name"], "Default accessible blue")
        self.assertGreaterEqual(
            contrast_ratio(theme["colors"]["ink"], theme["colors"]["paper"]), 4.5)

    def test_custom_theme_controls_css_and_chart_tokens(self):
        theme = json.loads((ROOT / "theme.json").read_text(encoding="utf-8"))
        theme["name"] = "Synthetic custom theme"
        theme["colors"]["primary"] = "#6D28D9"
        theme["layout"]["radius_px"] = 8
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "theme.json"
            path.write_text(json.dumps(theme), encoding="utf-8")
            output = render(content(), theme_path=path)
        self.assertIn("--primary: #6d28d9;", output)
        self.assertIn("--radius: 8px;", output)
        self.assertIn('token("--primary",', output)

    def test_theme_rejects_unsafe_fonts_unknown_fields_and_low_contrast(self):
        original = json.loads((ROOT / "theme.json").read_text(encoding="utf-8"))
        cases = []
        unsafe_font = json.loads(json.dumps(original))
        unsafe_font["typography"]["text"] = ["Arial; color: red"]
        cases.append((unsafe_font, "unsafe font-family"))
        unknown = json.loads(json.dumps(original))
        unknown["colors"]["brand_gradient"] = "#000000"
        cases.append((unknown, "unknown keys"))
        low_contrast = json.loads(json.dumps(original))
        low_contrast["colors"]["muted"] = "#FEFEFE"
        cases.append((low_contrast, "contrast"))
        for theme, message in cases:
            with self.subTest(message=message), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "theme.json"
                path.write_text(json.dumps(theme), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    render(content(), theme_path=path)

    def test_validated_dark_theme_is_supported(self):
        theme = json.loads((ROOT / "theme.json").read_text(encoding="utf-8"))
        theme["name"] = "Synthetic dark theme"
        theme["mode"] = "dark"
        theme["colors"].update({
            "paper": "#111827", "surface": "#1F2937", "ink": "#F9FAFB",
            "muted": "#D1D5DB", "line": "#6B7280", "primary": "#60A5FA",
            "primary_dark": "#DBEAFE", "primary_light": "#93C5FD",
            "primary_soft": "#1E3A5F", "secondary": "#C4B5FD",
            "positive": "#86EFAC", "negative": "#FCA5A5", "caution": "#FDE68A",
        })
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "theme.json"
            path.write_text(json.dumps(theme), encoding="utf-8")
            output = render(content(), theme_path=path)
        self.assertIn("color-scheme: dark;", output)
        self.assertIn("--paper: #111827;", output)


class ChartTests(unittest.TestCase):
    def test_every_family_passes_markup_validation(self):
        for kind in ["bar", "line", "waterfall", "stacked", "dumbbell", "scatter",
                     "bullet", "variance", "histogram", "range", "heatmap", "timeline",
                     "scenario"]:
            with self.subTest(kind=kind):
                output = validate_fragment(render_chart(spec(kind), kind))
                self.assertEqual(output.count("data-chart-spec"), 1)
                self.assertNotIn("<svg ", output)
                self.assertIn("Values and accessible chart detail", output)
                self.assertNotRegex(output, r'="(?:nan|inf)"')

    def test_chart_text_cannot_inject_markup(self):
        chart = spec()
        chart["title"] = '<script>window.__probe=1</script>'
        chart["data"][0]["label"] = '<svg onload="window.__probe=1">'
        output = validate_fragment(render_chart(chart))
        self.assertNotIn("<script>", output)
        self.assertNotIn("<svg onload=", output)

    def test_domains_include_data_and_zero_for_bars(self):
        self.assertEqual(extent([-2, 3], zero=True), (-2, 3))
        self.assertEqual(extent([0], zero=True), (0, 1))
        for domain in [[0, 10], [-1, 3], [3, -2]]:
            with self.subTest(domain=domain), self.assertRaises(ValueError):
                render_chart(dict(spec(), domain=domain))

    def test_missing_line_observation_creates_gap(self):
        output = render_chart(spec("line"))
        self.assertNotIn('stroke-width="2.5"', output)
        self.assertIn("1 missing observation", output)
        self.assertIn("Not available", output)

    def test_invalid_specs_rejected(self):
        bad = [dict(spec(), script="test"), dict(spec(), data=[]), dict(spec(), decimals=True),
               dict(spec(), data=[{"label": "A", "value": float("nan")}]),
               dict(spec(), data=[{"label": "A", "value": "12"}])]
        waterfall = spec("waterfall")
        waterfall["data"][-1]["value"] = 8
        bad.append(waterfall)
        invalid_timeline = spec("timeline")
        invalid_timeline["data"][0]["x"] = "not-a-date"
        bad.append(invalid_timeline)
        descending_dates = spec("line")
        descending_dates.update(x_type="date", data=[
            {"label": "Later", "x": "2026-02-01", "value": 2},
            {"label": "Earlier", "x": "2026-01-01", "value": 1},
        ])
        bad.append(descending_dates)
        for chart in bad:
            with self.subTest(chart=chart), self.assertRaises(ValueError):
                render_chart(chart)


if __name__ == "__main__":
    unittest.main()
