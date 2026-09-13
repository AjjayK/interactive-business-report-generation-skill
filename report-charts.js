/* Render validated report chart payloads with the vendored ECharts runtime. */
(() => {
  "use strict";

  const rootStyle = getComputedStyle(document.documentElement);
  const token = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const PRIMARY = token("--primary", "#2563eb");
  const PRIMARY_DARK = token("--primary-dark", "#1e3a8a");
  const PRIMARY_LIGHT = token("--primary-light", "#3b82f6");
  const SECONDARY = token("--secondary", "#b45309");
  const NEGATIVE = token("--negative", "#b42332");
  const INK = token("--ink", "#172033");
  const MUTED = token("--muted", "#5c6675");
  const GRID = token("--line", "#d6dce5");
  const SURFACE = token("--surface", "#f7f9fc");
  const FONT = token("--font-text", 'Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif');
  const mobileQuery = window.matchMedia("(max-width: 575px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const LOCALE = document.documentElement.lang || undefined;
  const numberFormats = new Map();
  const statusColors = {
    neutral: PRIMARY,
    info: PRIMARY_DARK,
    positive: token("--positive", "#18794e"),
    negative: NEGATIVE,
    caution: token("--caution", "#8a5a00")
  };

  function decode(encoded) {
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const UI = decode(document.body.dataset.uiLabels);
  const ui = (key, values = {}) => Object.entries(values).reduce(
    (label, [name, value]) => label.replaceAll(`{${name}}`, String(value)), UI[key]);

  function formatNumber(value, digits) {
    if (value === null || value === undefined) return UI.not_available;
    const key = String(digits);
    if (!numberFormats.has(key)) {
      numberFormats.set(key, new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }));
    }
    return numberFormats.get(key).format(value);
  }

  function formatDisplayNumber(value, digits) {
    if (value === null || value === undefined) return UI.not_available;
    if (Math.abs(value) < 10000) return formatNumber(value, digits);
    return new Intl.NumberFormat(LOCALE, {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(value);
  }

  function axisStyle() {
    return {
      axisLine: { lineStyle: { color: MUTED } },
      axisTick: { lineStyle: { color: MUTED } },
      axisLabel: { color: MUTED, fontFamily: FONT, fontSize: 12 },
      splitLine: { lineStyle: { color: GRID } }
    };
  }

  function common(spec, trigger = "item") {
    return {
      animation: !reducedMotion.matches,
      animationDuration: 280,
      color: [PRIMARY, PRIMARY_DARK, PRIMARY_LIGHT, SECONDARY],
      textStyle: { color: INK, fontFamily: FONT, fontSize: 12 },
      aria: {
        enabled: true,
        description: `${spec.title}. ${spec.caption}`,
        decal: { show: false }
      },
      tooltip: {
        trigger,
        renderMode: "richText",
        confine: true,
        textStyle: { fontFamily: FONT, fontSize: 12 }
      }
    };
  }

  function categoryGrid() {
    return mobileQuery.matches
      ? { left: 118, right: 62, top: 16, bottom: 44, containLabel: false }
      : { left: 270, right: 86, top: 16, bottom: 44, containLabel: false };
  }

  function categoryAxis(rows) {
    return {
      type: "category",
      data: rows.map(row => row.label),
      inverse: true,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: MUTED,
        fontFamily: FONT,
        fontSize: 12,
        width: mobileQuery.matches ? 104 : 250,
        overflow: "truncate",
        align: "right",
        margin: 10
      },
      triggerEvent: true
    };
  }

  function valueAxis(spec, scale = false) {
    const axis = { type: "value", name: spec.unit, nameLocation: "middle", nameGap: 32,
      scale, splitNumber: mobileQuery.matches ? 3 : 5, ...axisStyle() };
    axis.axisLabel.formatter = value => formatDisplayNumber(value, spec.decimals);
    if (spec.domain) [axis.min, axis.max] = spec.domain;
    return axis;
  }

  function barOption(spec, rows) {
    const option = common(spec, "axis");
    option.grid = categoryGrid();
    option.xAxis = valueAxis(spec);
    option.yAxis = categoryAxis(rows);
    option.series = [{
      name: spec.unit,
      type: "bar",
      barMaxWidth: 18,
      data: rows.map(row => ({
        value: row.value,
        itemStyle: { color: statusColors[row.status] || PRIMARY },
        label: { position: "right", distance: 6 }
      })),
      label: {
        show: true,
        color: INK,
        fontFamily: FONT,
        fontSize: 12,
        formatter: params => formatDisplayNumber(params.value, spec.decimals)
      },
      emphasis: { focus: "self" }
    }];
    return option;
  }

  function lineOption(spec, rows, scatter = false) {
    const option = common(spec, "axis");
    option.grid = { left: 66, right: 30, top: 32, bottom: 58 };
    option.xAxis = { type: "value", name: spec.x_unit, nameLocation: "middle", nameGap: 34,
      scale: true, splitNumber: mobileQuery.matches ? 3 : 5, ...axisStyle() };
    if (spec.x_domain) [option.xAxis.min, option.xAxis.max] = spec.x_domain;
    option.yAxis = valueAxis(spec, true);
    const observed = {
      name: spec.unit,
      type: scatter ? "scatter" : "line",
      data: rows.map(row => ({ name: row.label, value: [row.x, row.value] })),
      connectNulls: false,
      symbolSize: scatter ? 9 : 7,
      lineStyle: { width: 2.5, color: PRIMARY },
      itemStyle: { color: PRIMARY },
      emphasis: { focus: "self" }
    };
    option.series = [observed];
    if (!scatter && rows.some(row => Object.hasOwn(row, "low"))) {
      option.legend = { data: [UI.observed, UI.lower_bound, UI.upper_bound], bottom: 0 };
      observed.name = UI.observed;
      option.series.push(
        { name: UI.lower_bound, type: "line", data: rows.map(row => [row.x, row.low]),
          symbol: "none", lineStyle: { color: PRIMARY_LIGHT, type: "dashed" } },
        { name: UI.upper_bound, type: "line", data: rows.map(row => [row.x, row.high]),
          symbol: "none", lineStyle: { color: PRIMARY_LIGHT, type: "dashed" } }
      );
    }
    return option;
  }

  function waterfallOption(spec, rows) {
    let running = 0;
    const helper = [];
    const values = [];
    rows.forEach(row => {
      if (row.kind === "total") {
        helper.push(0);
        values.push({ value: row.value, display: row.value, itemStyle: { color: PRIMARY } });
        running = row.value;
      } else {
        const next = running + row.value;
        helper.push(Math.min(running, next));
        values.push({ value: Math.abs(row.value), display: row.value,
          itemStyle: { color: row.value < 0 ? PRIMARY_DARK : PRIMARY_LIGHT } });
        running = next;
      }
    });
    const option = common(spec, "axis");
    if (mobileQuery.matches) {
      option.grid = categoryGrid();
      option.xAxis = valueAxis(spec);
      option.yAxis = categoryAxis(rows);
      option.series = [
        { type: "bar", stack: "waterfall", silent: true,
          itemStyle: { color: "transparent" }, data: helper },
        { name: spec.unit, type: "bar", stack: "waterfall", barMaxWidth: 18,
          data: values.map(item => ({
            ...item,
            label: { position: item.display < 0 ? "left" : "right" }
          })),
          label: { show: true, color: INK, fontSize: 11,
            formatter: params => formatDisplayNumber(params.data.display, spec.decimals) } }
      ];
      return option;
    }
    option.grid = { left: 64, right: 24, top: 24, bottom: mobileQuery.matches ? 104 : 72 };
    option.xAxis = {
      type: "category",
      data: rows.map(row => row.label),
      axisLabel: {
        ...axisStyle().axisLabel,
        interval: 0,
        rotate: mobileQuery.matches ? 42 : rows.length > 6 ? 25 : 0,
        width: mobileQuery.matches ? 82 : undefined,
        overflow: mobileQuery.matches ? "truncate" : undefined
      }
    };
    option.yAxis = valueAxis(spec);
    option.series = [
      { type: "bar", stack: "waterfall", silent: true, itemStyle: { color: "transparent" }, data: helper },
      { name: spec.unit, type: "bar", stack: "waterfall", data: values,
        label: { show: true, position: "top", color: INK,
          fontSize: mobileQuery.matches ? 11 : 12,
          formatter: params => formatDisplayNumber(params.data.display, spec.decimals) } }
    ];
    return option;
  }

  function stackedOption(spec, rows) {
    const totals = rows.map(row => row.values.reduce((sum, value) => sum + value, 0));
    const option = common(spec, "axis");
    option.grid = categoryGrid();
    option.legend = { data: spec.series, top: 0, type: "scroll" };
    option.xAxis = { ...valueAxis(spec), max: spec.normalize ? 100 : undefined };
    option.yAxis = categoryAxis(rows);
    option.series = spec.series.map((name, seriesIndex) => ({
      name,
      type: "bar",
      stack: "total",
      barMaxWidth: 22,
      data: rows.map((row, rowIndex) => spec.normalize
        ? (totals[rowIndex] ? row.values[seriesIndex] * 100 / totals[rowIndex] : 0)
        : row.values[seriesIndex]),
      emphasis: { focus: "series" }
    }));
    return option;
  }

  function dumbbellOption(spec, rows) {
    const option = common(spec, "item");
    option.grid = categoryGrid();
    option.xAxis = valueAxis(spec);
    option.yAxis = categoryAxis(rows);
    option.series = [{
      name: `${spec.before_label} to ${spec.after_label}`,
      type: "custom",
      dimensions: ["category", spec.before_label, spec.after_label],
      encode: { x: [1, 2], y: 0, tooltip: [0, 1, 2] },
      data: rows.map(row => [row.label, row.before, row.after]),
      renderItem: (params, api) => {
        const category = api.value(0);
        const before = api.value(1);
        const after = api.value(2);
        const children = [];
        const beforePoint = before == null ? null : api.coord([before, category]);
        const afterPoint = after == null ? null : api.coord([after, category]);
        if (beforePoint && afterPoint) {
          children.push({ type: "line", shape: { x1: beforePoint[0], y1: beforePoint[1], x2: afterPoint[0], y2: afterPoint[1] }, style: { stroke: MUTED, lineWidth: 2 } });
        }
        if (beforePoint) children.push({ type: "circle", shape: { cx: beforePoint[0], cy: beforePoint[1], r: 5 }, style: { fill: PRIMARY_LIGHT } });
        if (afterPoint) children.push({ type: "circle", shape: { cx: afterPoint[0], cy: afterPoint[1], r: 5 }, style: { fill: PRIMARY } });
        return { type: "group", children };
      }
    }];
    return option;
  }

  function bulletOption(spec, rows) {
    const option = common(spec, "axis");
    option.grid = categoryGrid();
    option.xAxis = valueAxis(spec);
    option.yAxis = categoryAxis(rows);
    option.legend = { data: [UI.actual, UI.target], top: 0 };
    option.series = [
      {
        name: UI.actual, type: "bar", barMaxWidth: 18,
        data: rows.map(row => ({ value: row.value, itemStyle: { color: statusColors[row.status] || PRIMARY } })),
        label: { show: true, position: "right", color: INK,
          formatter: params => formatDisplayNumber(params.value, spec.decimals) }
      },
      {
        name: UI.target, type: "scatter", symbol: "rect", symbolSize: [4, 24],
        data: rows.map(row => [row.target, row.label]), itemStyle: { color: INK },
        tooltip: { valueFormatter: value => formatNumber(value, spec.decimals) }
      }
    ];
    return option;
  }

  function varianceOption(spec, rows) {
    const option = barOption(spec, rows);
    option.series[0].data = rows.map(row => ({
      value: row.value,
      itemStyle: { color: statusColors[row.status] || (row.value < 0 ? NEGATIVE : PRIMARY) },
      label: { position: row.value < 0 ? "left" : "right", distance: 6 }
    }));
    option.series[0].markLine = { silent: true, symbol: "none", data: [{ xAxis: 0 }],
      lineStyle: { color: MUTED, width: 1.5 } };
    return option;
  }

  function histogramOption(spec, rows) {
    const option = common(spec, "axis");
    option.grid = { left: 66, right: 24, top: 24, bottom: 76 };
    option.xAxis = { type: "category", data: rows.map(row => row.label),
      axisLabel: { ...axisStyle().axisLabel, interval: 0, rotate: rows.length > 8 ? 35 : 0 } };
    option.yAxis = valueAxis(spec);
    option.series = [{ name: spec.unit, type: "bar", barMaxWidth: 52,
      data: rows.map(row => row.value), itemStyle: { color: PRIMARY },
      label: { show: rows.length <= 12, position: "top", color: INK,
        formatter: params => formatDisplayNumber(params.value, spec.decimals) } }];
    return option;
  }

  function rangeOption(spec, rows) {
    const option = common(spec, "item");
    option.grid = categoryGrid();
    option.xAxis = valueAxis(spec, true);
    option.yAxis = categoryAxis(rows);
    option.series = [{
      name: spec.unit, type: "custom", dimensions: ["category", "low", "high", "value"],
      encode: { x: [1, 2, 3], y: 0, tooltip: [0, 1, 2, 3] },
      data: rows.map(row => [row.label, row.low, row.high, row.value]),
      renderItem: (params, api) => {
        const category = api.value(0), low = api.value(1), high = api.value(2), value = api.value(3);
        const lowPoint = api.coord([low, category]), highPoint = api.coord([high, category]);
        const children = [
          { type: "line", shape: { x1: lowPoint[0], y1: lowPoint[1], x2: highPoint[0], y2: highPoint[1] }, style: { stroke: PRIMARY_LIGHT, lineWidth: 8 } },
          { type: "circle", shape: { cx: lowPoint[0], cy: lowPoint[1], r: 4 }, style: { fill: PRIMARY_DARK } },
          { type: "circle", shape: { cx: highPoint[0], cy: highPoint[1], r: 4 }, style: { fill: PRIMARY_DARK } }
        ];
        if (value !== undefined && value !== null) {
          const point = api.coord([value, category]);
          children.push({ type: "circle", shape: { cx: point[0], cy: point[1], r: 6 }, style: { fill: SECONDARY, stroke: INK, lineWidth: 1 } });
        }
        return { type: "group", children };
      }
    }];
    return option;
  }

  function heatmapOption(spec, rows) {
    const xLabels = [...new Set(rows.map(row => row.x_label))];
    const yLabels = [...new Set(rows.map(row => row.label))];
    const values = rows.map(row => row.value).filter(value => value !== null);
    const minimum = spec.domain ? spec.domain[0] : Math.min(...values);
    const maximum = spec.domain ? spec.domain[1] : Math.max(...values);
    const option = common(spec, "item");
    option.grid = { left: mobileQuery.matches ? 112 : 170, right: 30, top: 24, bottom: 86 };
    option.xAxis = { type: "category", data: xLabels, splitArea: { show: true },
      axisLabel: { ...axisStyle().axisLabel, interval: 0, rotate: xLabels.length > 6 ? 35 : 0 } };
    option.yAxis = { type: "category", data: yLabels, splitArea: { show: true },
      axisLabel: { ...axisStyle().axisLabel, width: mobileQuery.matches ? 98 : 155, overflow: "truncate" } };
    option.visualMap = { min: minimum, max: maximum === minimum ? minimum + 1 : maximum,
      calculable: false, orient: "horizontal", left: "center", bottom: 4,
      textStyle: { color: MUTED }, inRange: { color: [SURFACE, PRIMARY_LIGHT, PRIMARY_DARK] } };
    option.series = [{ name: spec.unit, type: "heatmap",
      data: rows.map(row => [xLabels.indexOf(row.x_label), yLabels.indexOf(row.label), row.value]),
      label: { show: true, color: INK,
        formatter: params => formatDisplayNumber(params.value[2], spec.decimals) },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: MUTED } } }];
    return option;
  }

  function timelineOption(spec, rows) {
    const option = common(spec, "item");
    option.grid = { left: 56, right: 30, top: 52, bottom: 58 };
    option.xAxis = { type: ["date", "datetime"].includes(spec.x_type) ? "time" : "value",
      name: spec.unit, nameLocation: "middle", nameGap: 34, ...axisStyle() };
    option.yAxis = { type: "value", min: -1, max: 1, show: false };
    option.series = [{ name: spec.unit, type: "scatter", symbolSize: 12,
      data: rows.map((row, index) => ({ name: row.label, value: [row.x, index % 2 ? -.2 : .2],
        detail: row.detail, label: { position: index % 2 ? "bottom" : "top" } })),
      itemStyle: { color: PRIMARY },
      label: { show: true, color: INK, formatter: params => params.name } }];
    return option;
  }

  function scenarioOption(spec, rows) {
    const option = common(spec, "axis");
    option.grid = { left: 66, right: 30, top: 54, bottom: 58 };
    option.legend = { data: spec.series, top: 0, type: "scroll" };
    option.xAxis = { type: "category", data: rows.map(row => row.label),
      axisLabel: { ...axisStyle().axisLabel, interval: 0 } };
    option.yAxis = valueAxis(spec, spec.style !== "bar");
    option.series = spec.series.map((name, index) => ({ name, type: spec.style || "line",
      data: rows.map(row => row.values[index]), symbolSize: 7, emphasis: { focus: "series" } }));
    return option;
  }

  function makeOption(spec, rows) {
    if (spec.type === "bar") return barOption(spec, rows);
    if (spec.type === "line") return lineOption(spec, rows);
    if (spec.type === "scatter") return lineOption(spec, rows, true);
    if (spec.type === "waterfall") return waterfallOption(spec, rows);
    if (spec.type === "stacked") return stackedOption(spec, rows);
    if (spec.type === "dumbbell") return dumbbellOption(spec, rows);
    if (spec.type === "bullet") return bulletOption(spec, rows);
    if (spec.type === "variance") return varianceOption(spec, rows);
    if (spec.type === "histogram") return histogramOption(spec, rows);
    if (spec.type === "range") return rangeOption(spec, rows);
    if (spec.type === "heatmap") return heatmapOption(spec, rows);
    if (spec.type === "timeline") return timelineOption(spec, rows);
    return scenarioOption(spec, rows);
  }

  function setHeight(host, spec, rows) {
    const count = rows.length;
    const categorical = ["bar", "stacked", "dumbbell", "bullet", "variance", "range"].includes(spec.type) ||
      (spec.type === "waterfall" && mobileQuery.matches);
    const rowHeight = mobileQuery.matches ? 38 : 32;
    const heatmapRows = spec.type === "heatmap" ? new Set(rows.map(row => row.label)).size : 0;
    host.style.height = `${categorical ? Math.max(260, 104 + count * rowHeight) : heatmapRows ? Math.max(320, 150 + heatmapRows * 34) : 390}px`;
  }

  document.querySelectorAll("[data-chart-root]").forEach(root => {
    const host = root.querySelector("[data-chart-host]");
    if (!host || !globalThis.echarts) return;
    try {
      const spec = decode(host.dataset.chartSpec);
      const actions = root.querySelector("[data-chart-actions]");
      const toggle = root.querySelector("[data-chart-toggle]");
      const empty = root.querySelector("[data-chart-empty]");
      const section = root.closest(".report-section");
      let expanded = false;
      let activeFilters = {};
      let visibleRows = spec.data;
      const chart = globalThis.echarts.init(host, null, { renderer: "svg" });
      const render = () => {
        visibleRows = spec.data.filter(row => Object.entries(activeFilters).every(
          ([filterId, value]) => !value || row.filters?.[filterId] === value));
        const collapsed = mobileQuery.matches && visibleRows.length > 10 && !expanded;
        const rows = collapsed ? visibleRows.slice(0, 10) : visibleRows;
        setHeight(host, spec, rows);
        if (rows.length) chart.setOption(makeOption(spec, rows), { notMerge: true });
        else chart.clear();
        chart.resize();
        if (empty) empty.hidden = Boolean(rows.length);
        root.dataset.visibleRows = String(visibleRows.length);
        if (actions && toggle) {
          actions.hidden = !(mobileQuery.matches && visibleRows.length > 10);
          toggle.setAttribute("aria-expanded", String(expanded));
          toggle.textContent = expanded ? UI.show_fewer_rows : ui("show_all_rows", { count: visibleRows.length });
        }
      };
      toggle?.addEventListener("click", () => { expanded = !expanded; render(); });
      section?.addEventListener("report:filters-changed", event => {
        activeFilters = event.detail?.filters || {};
        expanded = false;
        render();
      });
      chart.on("click", params => {
        const selected = visibleRows[params.dataIndex];
        if (!selected || !section) return;
        section.dispatchEvent(new CustomEvent("report:drilldown", {
          detail: { chart: spec.definition_id, category: selected.label }
        }));
      });
      mobileQuery.addEventListener?.("change", render);
      reducedMotion.addEventListener?.("change", render);
      new ResizeObserver(() => chart.resize()).observe(host);
      render();
      root.dataset.chartReady = "true";
    } catch (error) {
      root.classList.add("chart-error");
      console.error("Report chart failed to render", error);
    }
  });
})();
