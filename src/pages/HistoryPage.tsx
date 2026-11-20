import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { api } from "../api";
import {
  EmptyState,
  LoadingBlock,
  MonoLabel,
  Panel,
  SectionTitle,
  StatusTag,
} from "../components/Common";
import { formatBytes, formatTime } from "../format";
import { useI18n } from "../i18n";
import { border, paper, shadowLg, tangerine } from "../styles/tokens";
import type { CleanupInfo, Job } from "../types";

type Props = {
  active: boolean;
  onNotify: (message: string, tone?: "success" | "error" | "info") => void;
  onError: (message: string) => void;
};

export default function HistoryPage({ active, onNotify, onError }: Props) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cleanup, setCleanup] = useState<CleanupInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await api.jobs());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [onError]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const preview = useCallback(
    async (id: string) => {
      try {
        setCleanup(await api.cleanupPreview(id));
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },
    [onError],
  );

  const confirmCleanup = useCallback(async () => {
    if (!cleanup) return;
    setBusy(true);
    try {
      const bytes = await api.cleanup(cleanup.id);
      onNotify(t("toast.cleanedBytes", { size: formatBytes(bytes) }), "success");
      setCleanup(null);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [cleanup, load, onError, onNotify, t]);

  return (
    <Stack spacing={3}>
      <SectionTitle
        kicker="ARCHIVE"
        hint={t("history.hint")}
        meta={
          <Button size="small" startIcon={<RefreshIcon />} onClick={() => void load()} disabled={loading}>
            {loading ? t("common.refreshing") : t("common.refresh")}
          </Button>
        }
      />

      {loading && !loaded ? (
        <Panel elevation="lg">
          <LoadingBlock label={t("history.loading")} />
        </Panel>
      ) : jobs.length === 0 ? (
        <EmptyState title={t("history.emptyTitle")} hint={t("history.emptyHint")} />
      ) : (
        <Panel elevation="lg" sx={{ p: 0 }}>
          <TableContainer sx={{ maxHeight: "calc(100vh - 360px)" }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t("history.time")}</TableCell>
                  <TableCell>{t("history.device")}</TableCell>
                  <TableCell>{t("common.version")}</TableCell>
                  <TableCell>{t("common.status")}</TableCell>
                  <TableCell align="right">{t("common.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {formatTime(job.created)}
                    </TableCell>
                    <TableCell sx={{ verticalAlign: "top", minWidth: 180 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, wordBreak: "break-all" }}>
                        {job.request.device || job.request.profile}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, wordBreak: "break-all" }}>{job.request.target}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", verticalAlign: "top" }}>{job.request.version}</TableCell>
                    <TableCell sx={{ verticalAlign: "top", minWidth: 180 }}>
                      <StatusTag status={job.status} stage={job.stage} />
                      {job.error ? (
                        <Typography sx={{ fontSize: 11.5, mt: 1, wordBreak: "break-all" }}>{job.error}</Typography>
                      ) : null}
                    </TableCell>
                    <TableCell align="right" sx={{ verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {job.status === "success" || job.status === "failed" || job.status === "cancelled" ? (
                        <Button size="small" startIcon={<DeleteIcon />} onClick={() => void preview(job.id)}>
                          {t("history.cleanupAction")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", p: 2, borderTop: border, flexWrap: "wrap" }}
          >
            <MonoLabel tone="paper">{t("history.count", { n: jobs.length })}</MonoLabel>
            <Typography sx={{ fontSize: 11.5 }}>{t("history.footNote")}</Typography>
          </Stack>
        </Panel>
      )}

      {cleanup ? (
        <Box
          sx={{
            border,
            borderLeft: `8px solid ${tangerine}`,
            backgroundColor: paper,
            boxShadow: shadowLg,
            p: 2.5,
            maxWidth: 720,
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.5, flexWrap: "wrap" }}>
            <MonoLabel>{t("history.cleanupTitle")}</MonoLabel>
            <Typography sx={{ fontSize: 12, wordBreak: "break-all" }}>{cleanup.id}</Typography>
          </Stack>
          <Typography sx={{ fontSize: 13, lineHeight: 1.65 }}>
            {t("history.cleanupBody", { size: formatBytes(cleanup.bytes) })}
            {cleanup.image ? t("history.cleanupImage", { image: cleanup.image }) : ""}
            {t("history.cleanupKeep")}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
            <Button variant="contained" disabled={busy} onClick={() => void confirmCleanup()}>
              {busy ? t("history.cleaning") : t("history.confirm")}
            </Button>
            <Button disabled={busy} onClick={() => setCleanup(null)}>
              {t("common.cancel")}
            </Button>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
