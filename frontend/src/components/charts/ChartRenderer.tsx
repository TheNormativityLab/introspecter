"use client";

import React, { useMemo } from 'react';
import { BarChart3, ExternalLink, X, Download, Maximize2 } from 'lucide-react';

interface StoredPlot {
  id?: string;
  type: string;
  title: string;
  url?: string;
  rawData?: any;
  renderType?: 'image' | 'plotly' | 'wordcloud' | 'geo' | 'svg' | 'html' | 'frontend' | 'error';
  data?: any;
  createdAt?: string;
  messageIndex?: number;
}

interface ChartRendererProps {
  chart: StoredPlot;
  onClose?: () => void;
  onExpand?: () => void;
  compact?: boolean;
}

function ChartWrapper({
  title, children, onClose, onExpand, url, chartId, compact = false, onDownload,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  onExpand?: () => void;
  url?: string;
  chartId?: string;
  compact?: boolean;
  onDownload?: () => void;
}) {
  const handleDownload = onDownload ?? (() => {
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '_')}.png`;
      link.click();
    }
  });


  return (
    <div className={`border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm ${compact ? 'mt-2' : 'mt-3'}`}>
      <div className={`px-4 ${compact ? 'py-2' : 'py-3'} bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200 flex items-center justify-between`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BarChart3 size={compact ? 16 : 18} className="text-indigo-500 flex-shrink-0" />
          <span className={`font-medium text-slate-700 ${compact ? 'text-xs' : 'text-sm'} truncate`}>
            {title}
          </span>
          {chartId && (
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              #{chartId.slice(-6)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {url && (
            <>
              <button
                onClick={handleDownload}
                className="p-1 hover:bg-white/60 rounded text-slate-400 hover:text-slate-600 transition-colors"
                title="Download chart"
              >
                <Download size={compact ? 12 : 14} />
              </button>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-white/60 rounded text-slate-400 hover:text-indigo-500 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={compact ? 12 : 14} />
              </a>
            </>
          )}
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 hover:bg-white/60 rounded text-slate-400 hover:text-slate-600 transition-colors"
              title="Expand chart"
            >
              <Maximize2 size={compact ? 12 : 14} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <X size={compact ? 12 : 14} />
            </button>
          )}
        </div>
      </div>
      <div className={compact ? 'p-2' : 'p-4'}>{children}</div>
    </div>
  );
}

export function ChartRenderer({ chart, onClose, onExpand, compact = false }: ChartRendererProps) {
  if (!chart) return null;

  // 1. QuickChart / any external image URL
  if (chart.renderType === 'image' || (chart.url && !chart.renderType)) {
    return <ImageChart chart={chart} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  // 2. Plotly traces+layout object from backend
  if (chart.renderType === 'plotly') {
    return <PlotlyChart chart={chart} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  // 3. Word cloud
  if (chart.renderType === 'wordcloud') {
    return <WordCloudChart chart={chart} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  // 4. Geo charts
  if (chart.renderType === 'geo') {
    return <GeoChart chart={chart} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  // 5. Error / unsupported
  if (chart.renderType === 'error') {
    return (
      <ChartWrapper title={chart.title} onClose={onClose} chartId={chart.id} compact={compact}>
        <p className="text-red-500 text-sm">Failed to generate chart data.</p>
      </ChartWrapper>
    );
  }

  // 6. Try to infer from chart type if renderType not set
  if (chart.type && !chart.renderType) {
    return <InferredChart chart={chart} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  return <UnsupportedChart chart={chart} onClose={onClose} compact={compact} />;
}

function ImageChart({ chart, onClose, onExpand, compact }: ChartRendererProps) {
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState(false);

  return (
    <ChartWrapper 
      title={chart.title} 
      onClose={onClose} 
      onExpand={onExpand}
      url={chart.url} 
      chartId={chart.id}
      compact={compact}
    >
      <div className="bg-slate-50 flex justify-center items-center rounded-lg p-2 min-h-[200px]">
        {!loaded && !error && (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
            <span className="text-sm">Loading chart...</span>
          </div>
        )}
        {error && (
          <div className="text-center py-8">
            <p className="text-slate-400 text-sm">Failed to load chart image</p>
            {chart.url && (
              <a
                href={chart.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 text-xs hover:underline mt-2 inline-block"
              >
                Try opening directly
              </a>
            )}
          </div>
        )}
        <img
          src={chart.url}
          alt={chart.title}
          className={`max-w-full h-auto rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          style={{ maxHeight: compact ? '300px' : '420px', display: error ? 'none' : 'block' }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      </div>
    </ChartWrapper>
  );
}

function PlotlyChart({ chart, onClose, onExpand, compact }: ChartRendererProps) {
  const plotData = chart.rawData ?? chart.data;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  const handleDownload = () => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'download', filename: chart.title.replace(/\s+/g, '_') },
      '*'
    );
  };

  const iframeHtml = useMemo(() => {
    if (!plotData?.traces) return null;

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      margin: { t: 40, b: 50, l: 60, r: 20 },
      font: { size: 13, color: '#374151' },
      ...(plotData.layout ?? {}),
      title: {
        text: chart.title,
        font: { size: 15 },
        ...(plotData.layout?.title ?? {}),
      },
    };

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: transparent; overflow: hidden; }
    #plot { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="plot"></div>
  <script>
    Plotly.newPlot(
      'plot',
      ${JSON.stringify(plotData.traces)},
      ${JSON.stringify(layout)},
      { responsive: true, displayModeBar: true, displaylogo: false }
    );

    window.addEventListener('message', function(e) {
      if (e.data?.type === 'download') {
        Plotly.downloadImage('plot', {
          format: 'png',
          width: 1600,
          height: 900,
          filename: e.data.filename || 'plot',
          scale: 2
        });
      }
    });
  </script>
</body>
</html>`;
  }, [plotData, chart.title]);

  if (!iframeHtml) {
    return (
      <ChartWrapper title={chart.title} onClose={onClose} chartId={chart.id} compact={compact}>
        <p className="text-slate-400 text-sm text-center py-6">No chart data available.</p>
      </ChartWrapper>
    );
  }

  return (
    <ChartWrapper
      title={chart.title}
      onClose={onClose}
      onExpand={onExpand}
      chartId={chart.id}
      compact={compact}
      onDownload={handleDownload}
    >
      <iframe
        ref={iframeRef}
        srcDoc={iframeHtml}
        sandbox="allow-scripts allow-downloads"
        title={chart.title}
        style={{
          width: '100%',
          height: compact ? '320px' : '420px',
          border: 'none',
          borderRadius: '8px',
        }}
      />
    </ChartWrapper>
  );
}

function WordCloudChart({ chart, onClose, onExpand, compact }: ChartRendererProps) {
  const words: { text: string; value: number }[] = chart.rawData ?? chart.data ?? [];
  
  if (words.length === 0) {
    return (
      <ChartWrapper title={chart.title} onClose={onClose} chartId={chart.id} compact={compact}>
        <p className="text-slate-400 text-sm text-center py-6">No word data available.</p>
      </ChartWrapper>
    );
  }

  const max = Math.max(...words.map((w) => w.value));
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

  return (
    <ChartWrapper title={chart.title} onClose={onClose} onExpand={onExpand} chartId={chart.id} compact={compact}>
      <div className={`flex flex-wrap gap-2 ${compact ? 'p-1' : 'p-2'} justify-center`}>
        {words
          .sort((a, b) => b.value - a.value)
          .slice(0, compact ? 40 : 60)
          .map((word, i) => {
            const size = (compact ? 10 : 12) + (word.value / max) * (compact ? 18 : 22);
            return (
              <span
                key={i}
                style={{
                  fontSize: `${size}px`,
                  color: colors[i % colors.length],
                  fontWeight: word.value > max * 0.5 ? 700 : 400,
                  lineHeight: 1.4,
                }}
                title={`${word.text}: ${word.value}`}
                className="hover:opacity-75 transition-opacity cursor-default"
              >
                {word.text}
              </span>
            );
          })}
      </div>
    </ChartWrapper>
  );
}

function GeoChart({ chart, onClose, onExpand, compact }: ChartRendererProps) {
  return (
    <ChartWrapper title={chart.title} onClose={onClose} onExpand={onExpand} chartId={chart.id} compact={compact}>
      <div className="text-center py-8 text-slate-500">
        <p className="text-sm">Geographic visualization</p>
        <p className="text-xs text-slate-400 mt-1">
          Data: {JSON.stringify(chart.data).slice(0, 100)}...
        </p>
      </div>
    </ChartWrapper>
  );
}

function InferredChart({ chart, onClose, onExpand, compact }: ChartRendererProps) {
  if (chart.url) {
    return <ImageChart chart={chart} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  const plotData = chart.rawData ?? chart.data;
  if (plotData?.traces) {
    return <PlotlyChart chart={{ ...chart, renderType: 'plotly' }} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  if (Array.isArray(plotData) && plotData[0]?.text && plotData[0]?.value !== undefined) {
    return <WordCloudChart chart={{ ...chart, renderType: 'wordcloud' }} onClose={onClose} onExpand={onExpand} compact={compact} />;
  }

  return <UnsupportedChart chart={chart} onClose={onClose} compact={compact} />;
}

function UnsupportedChart({ chart, onClose, compact }: ChartRendererProps & { onExpand?: never }) {
  return (
    <ChartWrapper title={chart.title} onClose={onClose} chartId={chart.id} compact={compact}>
      <div className="text-center text-slate-500 py-8 text-sm">
        <p>
          Chart type <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{chart.type}</code> is not yet
          rendered in the UI.
        </p>
        {chart.url && (
          <a 
            href={chart.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-indigo-500 hover:underline mt-2 inline-block"
          >
            View raw chart →
          </a>
        )}
        {chart.data && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
              View raw data
            </summary>
            <pre className="mt-2 p-2 bg-slate-50 rounded text-[10px] overflow-auto max-h-40">
              {JSON.stringify(chart.data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </ChartWrapper>
  );
}

interface ChartListProps {
  plots: StoredPlot[];
  onRemove?: (plotId: string) => void;
  onExpand?: (plot: StoredPlot) => void;
  compact?: boolean;
}

export function ChartList({ plots, onRemove, onExpand, compact = false }: ChartListProps) {
  if (!plots || plots.length === 0) return null;

  return (
    <div className="space-y-3">
      {plots.map((plot, index) => (
        <ChartRenderer
          key={plot.id || index}
          chart={plot}
          onClose={onRemove && plot.id ? () => onRemove(plot.id!) : undefined}
          onExpand={onExpand ? () => onExpand(plot) : undefined}
          compact={compact}
        />
      ))}
    </div>
  );
}

interface ChartModalProps {
  chart: StoredPlot | null;
  onClose: () => void;
}

export function ChartModal({ chart, onClose }: ChartModalProps) {
  if (!chart) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <ChartRenderer chart={chart} onClose={onClose} />
      </div>
    </div>
  );
}

export default ChartRenderer;