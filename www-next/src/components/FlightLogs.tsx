import { useState, useEffect } from "react";
import { RefreshCw, Eye, Download } from "lucide-react";
import {
  fetchFlightLogs,
  tailFlightLog,
  downloadFlightLogUrl,
} from "../api/client";
import type { FlightLog, FlightLogTail } from "../api/types";
import Card from "./ui/Card";
import Button from "./ui/Button";

export default function FlightLogs() {
  const [logs, setLogs] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    file: string;
    data: FlightLogTail;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFlightLogs();
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  async function handlePreview(file: string) {
    if (preview?.file === file) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const data = await tailFlightLog(file);
      setPreview({ file, data });
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <Card title="Flight Logs (CSV)">
      <div className="flex justify-end mb-2">
        <Button variant="secondary" onClick={loadLogs} loading={loading}>
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="text-error text-sm py-2">{error}</div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="text-text-secondary text-sm py-4 text-center">
          No flight logs found.
        </div>
      )}

      {logs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-secondary text-xs border-b border-border">
                <th className="text-left py-1.5 font-medium">Date/Time</th>
                <th className="text-right py-1.5 font-medium">Size</th>
                <th className="text-right py-1.5 font-medium">Rows</th>
                <th className="text-right py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.name}
                  className="border-b border-border last:border-0"
                >
                  <td className="py-1.5 tabular-nums">{log.modified}</td>
                  <td className="py-1.5 text-right tabular-nums text-text-secondary">
                    {log.size_kb.toFixed(1)} KB
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-text-secondary">
                    {log.lines}
                  </td>
                  <td className="py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="secondary"
                        onClick={() => handlePreview(log.name)}
                        loading={previewLoading && preview?.file !== log.name}
                      >
                        <Eye size={12} />
                        Preview
                      </Button>
                      <a
                        href={downloadFlightLogUrl(log.name)}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 text-sm rounded-md font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
                      >
                        <Download size={12} />
                        Download
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview panel */}
      {preview && (
        <div className="mt-3 bg-[#0d1117] rounded-md p-3 overflow-x-auto">
          <div className="text-xs text-text-secondary mb-2 font-mono">
            {preview.data.header}
          </div>
          <div className="font-mono text-xs space-y-0.5">
            {preview.data.rows.map((row, i) => (
              <div key={i} className="text-text-primary/80 whitespace-nowrap">
                {row}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
