import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { api, events } from "../api";
import { initialBuild } from "../defaults";
import { effectiveDefaultPackages, hasWirelessDriver, resolveChineseTranslations } from "../packageSelection";
import type {
  Artifact,
  Build,
  Device,
  Environment,
  Job,
  PackageItem,
  ProfileInfo,
  Settings,
} from "../types";
import { ConfigStep, DeviceStep, PackagesStep, ResultStep, ReviewStep } from "./BuildSteps";
import { ErrorNotice, StepRail } from "../components/Common";
import { useI18n } from "../i18n";
import { border, ink, labelStyle } from "../styles/tokens";

type Props = {
  settings: Settings;
  env: Environment | null;
  onNotify: (message: string, tone?: "success" | "error" | "info") => void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function BuildPage({ settings, env, onNotify }: Props) {
  const { t } = useI18n();
  const steps = [t("step.device"), t("step.packages"), t("step.config"), t("step.review")];
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Build>(initialBuild);

  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicePage, setDevicePage] = useState(1);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [items, setItems] = useState<PackageItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [error, setError] = useState("");
  const [deviceRetry, setDeviceRetry] = useState(0);
  const [packageRetry, setPackageRetry] = useState(0);

  const [job, setJob] = useState<Job | null>(null);
  const [log, setLog] = useState("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [busy, setBusy] = useState(false);
  const logOffset = useRef(0);
  const initialized = useRef(false);

  // 镜像来自设置页；首次进入时同步到草稿。
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const mirror = draft.mirror || settings.mirrors[0]?.url || "";
    setDraft((prev) => ({ ...prev, mirror, ecosystem: settings.ecosystem }));
  }, [draft.mirror, settings]);

  useEffect(() => {
    if (!draft.mirror) return;
    let cancelled = false;
    setLoadingVersions(true);
    setError("");
    api
      .versions(draft.mirror)
      .then((data) => {
        if (cancelled) return;
        setVersions(data.versions);
        const preferred = data.versions.includes(version)
          ? version
          : data.stable && data.versions.includes(data.stable)
            ? data.stable
            : data.versions[0] ?? "";
        setVersion(preferred);
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.mirror]);

  useEffect(() => {
    if (!draft.mirror || !version) return;
    let cancelled = false;
    setLoadingDevices(true);
    setError("");
    api
      .devices(draft.mirror, version)
      .then((data) => {
        if (cancelled) return;
        setDevices(data);
        setDevicePage(1);
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingDevices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.mirror, version, deviceRetry]);

  useEffect(() => {
    if (step !== 1 || !draft.mirror || !version || !draft.target || !draft.profile) return;
    let cancelled = false;
    setLoadingPackages(true);
    setError("");
    api
      .packages(draft.mirror, version, draft.target, draft.profile)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setWarnings(data.warnings);
      })
      .catch((e) => {
        if (!cancelled) setError(message(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingPackages(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft.mirror, version, draft.target, draft.profile, packageRetry]);

  useEffect(() => {
    const unlistenJob = events.onJobUpdate((payload) => {
      setJob((prev) =>
        prev && prev.id === payload.id
          ? { ...prev, status: payload.status, stage: payload.stage, error: payload.error }
          : prev,
      );
      if (payload.status === "success") {
        api.artifacts(payload.id).then(setArtifacts).catch(() => setArtifacts([]));
      }
    });
    const unlistenLog = events.onLog((payload) => {
      setJob((prev) => {
        if (prev && prev.id === payload.id) {
          logOffset.current += payload.text.length;
          setLog((text) => (text + payload.text).slice(-300_000));
        }
        return prev;
      });
    });
    return () => {
      void unlistenJob.then((fn) => fn());
      void unlistenLog.then((fn) => fn());
    };
  }, []);

  const filteredDevices = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return devices;
    return devices.filter(
      (d) =>
        d.title.toLowerCase().includes(key) ||
        d.id.toLowerCase().includes(key) ||
        d.target.toLowerCase().includes(key),
    );
  }, [devices, query]);

  const defaultPackages = useMemo(
    () => (profile ? effectiveDefaultPackages(profile.default_packages, profile.device_packages) : []),
    [profile],
  );

  const wirelessSupported = useMemo(
    () => (profile ? hasWirelessDriver([...profile.default_packages, ...profile.device_packages]) : false),
    [profile],
  );

  const available = useMemo(() => new Set(items.map((item) => item.name)), [items]);

  const selected = useMemo(() => new Set(draft.packages), [draft.packages]);

  const translations = useMemo(
    () =>
      resolveChineseTranslations(
        draft.packages.filter((name) => /^luci-(app|proto|mod)-/.test(name)),
        available,
      ),
    [draft.packages, available],
  );

  const patch = useCallback((next: Partial<Build>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  }, []);

  const chooseDevice = useCallback(
    async (device: Device) => {
      setError("");
      try {
        const info = await api.profile(draft.mirror, version, device.target, device.id);
        setProfile(info);
        setDraft((prev) => ({
          ...prev,
          device: device.title,
          target: device.target,
          profile: device.id,
          version,
        }));
        onNotify(t("toast.deviceSelected", { name: device.title }), "success");
      } catch (e) {
        setError(message(e));
      }
    },
    [draft.mirror, version, onNotify],
  );

  const toggle = useCallback((name: string) => {
    setDraft((prev) => {
      const inPackages = prev.packages.includes(name);
      const inRemove = prev.remove.includes(name);
      if (inPackages) {
        return { ...prev, packages: prev.packages.filter((p) => p !== name) };
      }
      if (inRemove) {
        return { ...prev, remove: prev.remove.filter((p) => p !== name) };
      }
      return { ...prev, packages: [...prev.packages, name].sort() };
    });
  }, []);

  const toggleDefault = useCallback((name: string) => {
    setDraft((prev) => {
      if (prev.remove.includes(name)) {
        return { ...prev, remove: prev.remove.filter((p) => p !== name) };
      }
      return {
        ...prev,
        remove: [...prev.remove, name].sort(),
        packages: prev.packages.filter((p) => p !== name),
      };
    });
  }, []);

  const validateStep = useCallback((): string => {
    if (step === 0) {
      if (!draft.profile || !profile) return t("validation.device");
    }
    if (step === 2) {
      const cidr = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
      if (draft.address && !cidr.test(draft.address)) return t("validation.address");
      if (draft.wifi_ssid && draft.wifi_password.length < 8) return t("validation.wifiPass");
      if (draft.rootfs_size && (draft.rootfs_size < 64 || draft.rootfs_size > 32768)) {
        return t("validation.rootfs");
      }
    }
    return "";
  }, [step, draft, profile, t]);

  const readLog = useCallback(async (id: string) => {
    const chunk = await api.readLog(id, 0);
    logOffset.current = chunk.next;
    setLog(chunk.text);
  }, []);

  const start = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const build: Build = {
        ...draft,
        ecosystem: settings.ecosystem,
        version,
        packages: [...draft.packages, ...translations.automatic],
        theme: draft.theme || "",
      };
      const created = await api.createJob(build);
      setJob(created);
      setArtifacts([]);
      setLog("");
      logOffset.current = 0;
      void readLog(created.id);
      setStep(4);
      onNotify(t("toast.buildStarted"), "success");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [draft, settings.ecosystem, version, translations.automatic, onNotify, readLog]);

  const cancel = useCallback(async () => {
    if (!job) return;
    setBusy(true);
    try {
      await api.cancelJob(job.id);
      onNotify(t("toast.cancelRequested"), "info");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [job, onNotify]);

  const download = useCallback(
    async (name: string) => {
      if (!job) return;
      setBusy(true);
      try {
        const path = await api.saveArtifact(job.id, name);
        onNotify(t("toast.saved", { path }), "success");
      } catch (e) {
        setError(message(e));
      } finally {
        setBusy(false);
      }
    },
    [job, onNotify],
  );

  const cleanup = useCallback(async () => {
    if (!job) return;
    setBusy(true);
    try {
      await api.cleanup(job.id);
      onNotify(t("toast.cleaned"), "success");
      setJob(null);
      setStep(0);
      setDraft({ ...initialBuild, mirror: draft.mirror, ecosystem: settings.ecosystem });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }, [job, onNotify, draft.mirror, settings.ecosystem]);

  const restart = useCallback(() => {
    setJob(null);
    setLog("");
    setArtifacts([]);
    setStep(0);
    setDraft({ ...initialBuild, mirror: draft.mirror, ecosystem: settings.ecosystem });
  }, [draft.mirror, settings.ecosystem]);

  const retry = useCallback(() => {
    setError("");
    setDeviceRetry((n) => n + 1);
    setPackageRetry((n) => n + 1);
  }, []);

  const next = useCallback(() => {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    if (step === 3) {
      void start();
      return;
    }
    setStep(step + 1);
  }, [step, validateStep, start]);

  return (
    <Stack spacing={3}>
      {step < 4 ? <StepRail steps={steps} active={step} /> : null}

      {error ? <ErrorNotice message={error} onRetry={retry} onDismiss={() => setError("")} /> : null}

      {step === 0 ? (
        <DeviceStep
          draft={draft}
          versions={versions}
          version={version}
          devices={filteredDevices}
          page={devicePage}
          query={query}
          loading={loadingDevices || loadingVersions}
          onVersion={setVersion}
          onQuery={(value) => {
            setQuery(value);
            setDevicePage(1);
          }}
          onPage={setDevicePage}
          onChoose={(device) => void chooseDevice(device)}
        />
      ) : null}

      {step === 1 ? (
        <PackagesStep
          draft={draft}
          patch={patch}
          defaultPackages={defaultPackages}
          selected={selected}
          available={available}
          items={items}
          warnings={warnings}
          search={search}
          category={category}
          theme={draft.theme}
          autoTranslations={translations.automatic}
          loading={loadingPackages}
          onSearch={setSearch}
          onCategory={setCategory}
          onToggle={toggle}
          onToggleDefault={toggleDefault}
        />
      ) : null}

      {step === 2 ? (
        <ConfigStep
          draft={draft}
          patch={patch}
          profile={profile}
          wirelessSupported={wirelessSupported}
          pppSupported
        />
      ) : null}

      {step === 3 ? (
        <ReviewStep
          draft={{ ...draft, version }}
          defaultPackages={defaultPackages}
          additionalCount={draft.packages.length + translations.automatic.length + (draft.theme ? 1 : 0)}
          wirelessSupported={wirelessSupported}
          env={env}
        />
      ) : null}

      {step === 4 && job ? (
        <ResultStep
          job={job}
          log={log}
          artifacts={artifacts}
          busy={busy}
          onCancel={() => void cancel()}
          onDownload={(name) => void download(name)}
          onCleanup={() => void cleanup()}
          onNewBuild={restart}
        />
      ) : null}

      {step < 4 ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            alignItems: { sm: "center" },
            borderTop: border,
            pt: 2.5,
          }}
        >
          <Stack direction="row" spacing={1.5}>
            <Button disabled={step === 0 || busy} onClick={() => setStep(Math.max(0, step - 1))}>
              {t("common.back")}
            </Button>
            <Button variant="contained" onClick={next} disabled={busy} aria-busy={busy}>
              {busy ? t("common.busy") : step === 3 ? t("common.start") : t("common.next")}
            </Button>
          </Stack>
          {draft.mirror ? (
            <Typography
              sx={{
                ...labelStyle,
                letterSpacing: "0.04em",
                fontSize: 11,
                ml: { sm: "auto" },
                textAlign: { xs: "left", sm: "right" },
                wordBreak: "break-all",
                color: ink,
              }}
            >
              {settings.ecosystem === "openwrt" ? "OpenWrt" : "ImmortalWrt"} · {draft.mirror}
            </Typography>
          ) : (
            <Box />
          )}
        </Stack>
      ) : null}
    </Stack>
  );
}
