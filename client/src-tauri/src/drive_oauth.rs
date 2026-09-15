//! Google Drive installed-app OAuth using PKCE and a loopback redirect.

use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use url::Url;

const SERVICE: &str = "inkwell";
const REFRESH_TOKEN_KEY: &str = "google-drive.refresh-token";
const ACCOUNT_KEY: &str = "google-drive.account";
const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const DEFAULT_CLIENT_ID: &str =
    "708325195614-vu52s7bbu14i1cdjsd14hkirvaqk52mf.apps.googleusercontent.com";

fn client_id() -> &'static str {
    option_env!("GOOGLE_DRIVE_CLIENT_ID").unwrap_or(DEFAULT_CLIENT_ID)
}

fn client_secret() -> &'static str {
    option_env!("GOOGLE_DRIVE_CLIENT_SECRET").unwrap_or("")
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveAuthStatus {
    configured: bool,
    connected: bool,
    account_email: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    #[serde(default = "default_expires_in")]
    expires_in: u64,
}

fn default_expires_in() -> u64 {
    3600
}

pub(crate) struct AccessToken {
    pub(crate) value: String,
    pub(crate) expires_in: u64,
}

#[derive(Deserialize)]
struct AboutResponse {
    user: AboutUser,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AboutUser {
    email_address: String,
}

fn read_key(key: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

/// Exchange the keychain-held refresh token for a short-lived access token.
/// Access tokens deliberately stay in memory and are never persisted.
pub(crate) fn refresh_access_token(
    http: &reqwest::blocking::Client,
) -> Result<AccessToken, String> {
    let refresh_token = read_key(REFRESH_TOKEN_KEY)?.ok_or("Google Drive is not connected")?;
    let mut form = vec![
        ("client_id", client_id()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if !client_secret().is_empty() {
        form.push(("client_secret", client_secret()));
    }
    let response = http
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .map_err(|e| format!("could not refresh Google authorization: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().unwrap_or_default();
        return Err(format!(
            "could not refresh Google authorization: {status}: {detail}"
        ));
    }
    let token: TokenResponse = response
        .json()
        .map_err(|e| format!("invalid Google token response: {e}"))?;
    Ok(AccessToken {
        value: token.access_token,
        expires_in: token.expires_in,
    })
}

fn delete_key(key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

#[tauri::command]
pub fn google_drive_status() -> Result<DriveAuthStatus, String> {
    let refresh = read_key(REFRESH_TOKEN_KEY)?;
    Ok(DriveAuthStatus {
        configured: !client_id().is_empty(),
        connected: refresh.is_some(),
        account_email: if refresh.is_some() {
            read_key(ACCOUNT_KEY)?
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn google_drive_connect(app: AppHandle) -> Result<DriveAuthStatus, String> {
    tauri::async_runtime::spawn_blocking(move || connect_blocking(app))
        .await
        .map_err(|e| format!("Google connection task failed: {e}"))?
}

fn connect_blocking(app: AppHandle) -> Result<DriveAuthStatus, String> {
    if client_id().is_empty() {
        return Err("Google Drive backup is not configured in this build".into());
    }

    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| format!("could not start the Google sign-in callback: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or("callback did not bind to an IP address")?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = uuid::Uuid::new_v4().simple().to_string();

    let mut auth_url =
        Url::parse("https://accounts.google.com/o/oauth2/v2/auth").map_err(|e| e.to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", client_id())
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", DRIVE_SCOPE)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state);

    app.opener()
        .open_url(auth_url.as_str(), None::<&str>)
        .map_err(|e| format!("could not open the system browser: {e}"))?;

    let request = server
        .recv_timeout(Duration::from_secs(180))
        .map_err(|e| format!("Google sign-in callback failed: {e}"))?
        .ok_or("Google sign-in timed out")?;
    let callback = Url::parse(&format!("http://127.0.0.1:{port}{}", request.url()))
        .map_err(|e| format!("invalid Google callback: {e}"))?;
    let params: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
    let response = if params.contains_key("code") {
        tiny_http::Response::from_string("Google authorization was received. You can close this window and return to Inkwell while it finishes connecting.")
    } else {
        tiny_http::Response::from_string(
            "Google Drive connection was not completed. You can close this window.",
        )
        .with_status_code(400)
    };
    request.respond(response).map_err(|e| e.to_string())?;

    if params.get("state") != Some(&state) {
        return Err("Google sign-in returned an invalid state".into());
    }
    if let Some(error) = params.get("error") {
        return Err(format!("Google sign-in was not completed: {error}"));
    }
    let code = params
        .get("code")
        .ok_or("Google sign-in returned no authorization code")?;

    let http = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let mut form = vec![
        ("client_id", client_id()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    if !client_secret().is_empty() {
        form.push(("client_secret", client_secret()));
    }
    let response = http
        .post("https://oauth2.googleapis.com/token")
        .form(&form)
        .send()
        .map_err(|e| format!("could not exchange Google authorization: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().unwrap_or_default();
        return Err(format!(
            "could not exchange Google authorization: {status}: {detail}"
        ));
    }
    let token: TokenResponse = response
        .json()
        .map_err(|e| format!("invalid Google token response: {e}"))?;
    let refresh_token = token.refresh_token.ok_or(
        "Google returned no refresh token; disconnect Inkwell in your Google Account and try again",
    )?;

    let about: AboutResponse = http
        .get("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)")
        .bearer_auth(&token.access_token)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("could not read the connected Drive account: {e}"))?
        .json()
        .map_err(|e| format!("invalid Google Drive account response: {e}"))?;

    Entry::new(SERVICE, REFRESH_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .set_password(&refresh_token)
        .map_err(|e| e.to_string())?;
    Entry::new(SERVICE, ACCOUNT_KEY)
        .map_err(|e| e.to_string())?
        .set_password(&about.user.email_address)
        .map_err(|e| e.to_string())?;
    google_drive_status()
}

#[tauri::command]
pub async fn google_drive_disconnect(
    session: tauri::State<'_, super::drive_client::DriveSession>,
) -> Result<DriveAuthStatus, String> {
    if let Some(token) = read_key(REFRESH_TOKEN_KEY)? {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            reqwest::blocking::Client::new()
                .post("https://oauth2.googleapis.com/revoke")
                .form(&[("token", token)])
                .send()
        })
        .await;
    }
    delete_key(REFRESH_TOKEN_KEY)?;
    delete_key(ACCOUNT_KEY)?;
    session.clear();
    google_drive_status()
}
