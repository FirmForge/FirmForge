use crate::error::{AppError, AppResult};
use crate::models::MirrorSource;
use reqwest::redirect::Policy;
use reqwest::{Client, Response};
use serde::de::DeserializeOwned;
use std::time::Duration;
use url::Url;

const MAX_BODY: u64 = 24 << 20; // 24 MiB，索引与 profiles.json 的上限
const MAX_TEXT: u64 = 256 << 10;

/// 被禁止的上游：镜像重定向到这些主机时视为错误，避免把请求带出所选镜像。
pub fn forbidden_host(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    if h == "downloads.immortalwrt.org" {
        return false;
    }
    h == "immortalwrt.org"
        || h.ends_with(".immortalwrt.org")
        || h == "openwrt.ai"
        || h.ends_with(".openwrt.ai")
        || h == "immortalwrt.kyarucloud.moe"
        || h == "sysupgrade.kyarucloud.moe"
}

/// 软件源必须是 https 且不含凭据、查询串、片段与路径穿越。
pub fn valid_mirror(raw: &str) -> bool {
    let Ok(u) = Url::parse(raw) else {
        return false;
    };
    if u.scheme() != "https" || u.host_str().is_none() {
        return false;
    }
    if !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return false;
    }
    if u.path().contains("..") {
        return false;
    }
    let path_ok = u
        .path()
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
    path_ok && !forbidden_host(u.host_str().unwrap_or(""))
}

/// 查询代理只接受 http / socks5，且不允许凭据与路径。
pub fn parse_proxy(value: &str) -> AppResult<Option<String>> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let u = Url::parse(value)
        .map_err(|_| AppError::Invalid("请输入 HTTP 或 SOCKS5 代理地址和端口".into()))?;
    if !matches!(u.scheme(), "http" | "socks5")
        || !u.username().is_empty()
        || u.password().is_some()
    {
        return Err(AppError::Invalid(
            "请输入 HTTP 或 SOCKS5 代理地址和端口".into(),
        ));
    }
    let bad_path = !matches!(u.path(), "" | "/");
    if u.host_str().is_none()
        || bad_path
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path().contains("..")
    {
        return Err(AppError::Invalid(
            "请输入 HTTP 或 SOCKS5 代理地址和端口".into(),
        ));
    }
    match u.port() {
        Some(p) if p > 0 => {}
        _ => return Err(AppError::Invalid("请输入有效的代理地址和端口".into())),
    }
    Ok(Some(u.to_string()))
}

/// 下载器：统一 UA、超时、重定向白名单与响应体积上限。
#[derive(Clone)]
pub struct Fetcher {
    client: Client,
}

impl Fetcher {
    pub fn new(proxy: Option<String>) -> AppResult<Self> {
        let mut builder = Client::builder()
            .user_agent("WrtKit/1.0")
            .timeout(Duration::from_secs(25))
            .redirect(Policy::custom(|attempt| {
                if attempt.previous().len() > 5 {
                    return attempt.error("重定向次数过多");
                }
                let host = attempt.url().host_str().unwrap_or("");
                if forbidden_host(host) {
                    return attempt.error("镜像重定向到未选择的上游服务器");
                }
                attempt.follow()
            }));
        if let Some(p) = &proxy {
            builder = builder
                .proxy(reqwest::Proxy::all(p).map_err(|e| AppError::Invalid(e.to_string()))?);
        }
        Ok(Self {
            client: builder
                .build()
                .map_err(|e| AppError::Network(e.to_string()))?,
        })
    }

    pub async fn send(&self, url: &str, method: reqwest::Method) -> AppResult<Response> {
        let resp = self
            .client
            .request(method, url)
            .send()
            .await
            .map_err(AppError::from)?;
        Ok(resp)
    }

    pub async fn get_json<T: DeserializeOwned>(&self, url: &str) -> AppResult<T> {
        let resp = self.send(url, reqwest::Method::GET).await?;
        if !resp.status().is_success() {
            return Err(AppError::Network(format!(
                "数据源响应 HTTP {}",
                resp.status().as_u16()
            )));
        }
        let body = read_limited(resp, MAX_BODY).await?;
        serde_json::from_slice(&body).map_err(AppError::from)
    }

    pub async fn get_text(&self, url: &str, limit: u64) -> AppResult<String> {
        let resp = self.send(url, reqwest::Method::GET).await?;
        if !resp.status().is_success() {
            return Err(AppError::Network(format!(
                "数据源响应 HTTP {}",
                resp.status().as_u16()
            )));
        }
        let body = read_limited(resp, limit.max(1)).await?;
        Ok(String::from_utf8_lossy(&body).to_string())
    }

    pub async fn exists(&self, url: &str) -> bool {
        match self.send(url, reqwest::Method::HEAD).await {
            Ok(r) => r.status().is_success(),
            Err(_) => false,
        }
    }
}

async fn read_limited(resp: Response, limit: u64) -> AppResult<Vec<u8>> {
    if let Some(len) = resp.content_length() {
        if len > limit {
            return Err(AppError::Format(format!("响应体过大: {len} 字节")));
        }
    }
    let mut out = Vec::new();
    let mut resp = resp;
    while let Some(chunk) = resp.chunk().await.map_err(AppError::from)? {
        if out.len() as u64 + chunk.len() as u64 > limit {
            return Err(AppError::Format("响应体超出大小限制".into()));
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

pub fn default_mirrors(ecosystem: crate::models::Ecosystem) -> Vec<MirrorSource> {
    use crate::models::Ecosystem::*;
    let base: &[(&str, &str)] = &[
        ("南京大学", "https://mirror.nju.edu.cn/immortalwrt"),
        ("北京大学", "https://mirrors.pku.edu.cn/immortalwrt"),
        ("浙江大学", "https://mirrors.zju.edu.cn/immortalwrt"),
        ("上海交通大学", "https://mirror.sjtu.edu.cn/immortalwrt"),
        (
            "中国科学技术大学",
            "https://mirrors.ustc.edu.cn/immortalwrt",
        ),
        (
            "CERNET 高校联合镜像",
            "https://mirrors.cernet.edu.cn/immortalwrt",
        ),
        ("Vsean 镜像", "https://mirrors.vsean.net/openwrt"),
        ("吉林大学", "https://mirrors.jlu.edu.cn/immortalwrt"),
        ("ImmortalWrt 官方", "https://downloads.immortalwrt.org"),
    ];
    match ecosystem {
        ImmortalWrt => base
            .iter()
            .map(|(n, u)| MirrorSource {
                name: (*n).to_string(),
                url: (*u).to_string(),
            })
            .collect(),
        OpenWrt => vec![
            MirrorSource {
                name: "南京大学".into(),
                url: "https://mirror.nju.edu.cn/openwrt".into(),
            },
            MirrorSource {
                name: "OpenWrt 官方".into(),
                url: "https://downloads.openwrt.org".into(),
            },
        ],
    }
}

pub const MAX_TEXT_LIMIT: u64 = MAX_TEXT;
