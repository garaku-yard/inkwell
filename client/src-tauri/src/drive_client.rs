//! Minimal Google Drive REST client for one-way backups.
//!
//! The backup engine owns traversal, hashing, and SQLite mappings. This module
//! only creates folders/files and updates a known file ID in place.

use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use reqwest::{blocking::Client, StatusCode};
use serde::{Deserialize, Serialize};

const DRIVE_API: &str = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";

#[derive(Debug, Deserialize)]
pub(crate) struct DriveFile {
    pub(crate) id: String,
    #[serde(default)]
    trashed: bool,
}

#[derive(Serialize)]
struct FileMetadata<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    parents: Option<[&'a str; 1]>,
    #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
    mime_type: Option<&'a str>,
}

pub(crate) struct DriveClient {
    http: Client,
    access_token: String,
    api_base: String,
    upload_base: String,
}

#[derive(Clone, Default)]
pub(crate) struct DriveSession {
    cached: Arc<Mutex<Option<(String, Instant)>>>,
}

impl DriveSession {
    fn client(&self) -> Result<DriveClient, String> {
        let http = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;
        let mut cached = self.cached.lock().map_err(|e| e.to_string())?;
        let token = match cached.as_ref() {
            Some((value, expires_at)) if *expires_at > Instant::now() + Duration::from_secs(30) => {
                value.clone()
            }
            _ => {
                let refreshed = super::drive_oauth::refresh_access_token(&http)?;
                let expires_at = Instant::now() + Duration::from_secs(refreshed.expires_in);
                *cached = Some((refreshed.value.clone(), expires_at));
                refreshed.value
            }
        };
        Ok(DriveClient::new(http, token, DRIVE_API, DRIVE_UPLOAD_API))
    }

    pub(crate) fn clear(&self) {
        if let Ok(mut cached) = self.cached.lock() {
            *cached = None;
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadRequest {
    name: String,
    parent_id: String,
    file_id: Option<String>,
    content_type: String,
    contents: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadResult {
    file_id: String,
    created: bool,
}

#[tauri::command]
pub(crate) async fn google_drive_create_folder(
    session: tauri::State<'_, DriveSession>,
    name: String,
    parent_id: Option<String>,
) -> Result<String, String> {
    let session = session.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        session.client()?.create_folder(&name, parent_id.as_deref())
    })
    .await
    .map_err(|e| format!("Drive folder task failed: {e}"))?
}

#[tauri::command]
pub(crate) async fn google_drive_file_exists(
    session: tauri::State<'_, DriveSession>,
    file_id: String,
) -> Result<bool, String> {
    let session = session.inner().clone();
    tauri::async_runtime::spawn_blocking(move || session.client()?.file_exists(&file_id))
        .await
        .map_err(|e| format!("Drive lookup task failed: {e}"))?
}

#[tauri::command]
pub(crate) async fn google_drive_upsert_file(
    session: tauri::State<'_, DriveSession>,
    upload: UploadRequest,
) -> Result<UploadResult, String> {
    let session = session.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let client = session.client()?;
        if let Some(id) = upload.file_id.as_deref() {
            if client.update_file(id, &upload.content_type, upload.contents.clone())? {
                return Ok(UploadResult {
                    file_id: id.to_owned(),
                    created: false,
                });
            }
        }
        let file_id = client.create_file(
            &upload.name,
            &upload.parent_id,
            &upload.content_type,
            upload.contents,
        )?;
        Ok(UploadResult {
            file_id,
            created: true,
        })
    })
    .await
    .map_err(|e| format!("Drive upload task failed: {e}"))?
}

impl DriveClient {
    fn new(http: Client, access_token: String, api_base: &str, upload_base: &str) -> Self {
        Self {
            http,
            access_token,
            api_base: api_base.trim_end_matches('/').to_owned(),
            upload_base: upload_base.trim_end_matches('/').to_owned(),
        }
    }

    pub(crate) fn file_exists(&self, file_id: &str) -> Result<bool, String> {
        let response = self
            .http
            .get(format!(
                "{}/files/{file_id}?fields=id,trashed&supportsAllDrives=false",
                self.api_base
            ))
            .bearer_auth(&self.access_token)
            .send()
            .map_err(|e| format!("could not check Drive file: {e}"))?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(false);
        }
        let file: DriveFile = response
            .error_for_status()
            .map_err(|e| format!("could not check Drive file: {e}"))?
            .json()
            .map_err(|e| format!("invalid Drive file response: {e}"))?;
        Ok(!file.trashed)
    }

    pub(crate) fn create_folder(
        &self,
        name: &str,
        parent_id: Option<&str>,
    ) -> Result<String, String> {
        let metadata = FileMetadata {
            name,
            parents: parent_id.map(|id| [id]),
            mime_type: Some(FOLDER_MIME),
        };
        let file: DriveFile = self
            .http
            .post(format!("{}/files?fields=id", self.api_base))
            .bearer_auth(&self.access_token)
            .json(&metadata)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|e| format!("could not create Drive folder {name:?}: {e}"))?
            .json()
            .map_err(|e| format!("invalid Drive folder response: {e}"))?;
        Ok(file.id)
    }

    pub(crate) fn create_file(
        &self,
        name: &str,
        parent_id: &str,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<String, String> {
        let metadata = FileMetadata {
            name,
            parents: Some([parent_id]),
            mime_type: None,
        };
        let metadata_json = serde_json::to_string(&metadata).map_err(|e| e.to_string())?;
        let boundary = format!("inkwell-{}", uuid::Uuid::new_v4().simple());
        let mut body = format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata_json}\r\n--{boundary}\r\nContent-Type: {content_type}\r\n\r\n"
        )
        .into_bytes();
        body.extend_from_slice(&bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let file: DriveFile = self
            .http
            .post(format!(
                "{}/files?uploadType=multipart&fields=id",
                self.upload_base
            ))
            .bearer_auth(&self.access_token)
            .header(
                reqwest::header::CONTENT_TYPE,
                format!("multipart/related; boundary={boundary}"),
            )
            .body(body)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|e| format!("could not upload Drive file {name:?}: {e}"))?
            .json()
            .map_err(|e| format!("invalid Drive upload response: {e}"))?;
        Ok(file.id)
    }

    /// Update a mapped file. A missing remote ID is reported as `Ok(false)` so
    /// the backup engine can create it again and replace its stale mapping.
    pub(crate) fn update_file(
        &self,
        file_id: &str,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<bool, String> {
        let response = self
            .http
            .patch(format!(
                "{}/files/{file_id}?uploadType=media",
                self.upload_base
            ))
            .bearer_auth(&self.access_token)
            .header(reqwest::header::CONTENT_TYPE, content_type)
            .body(bytes)
            .send()
            .map_err(|e| format!("could not update Drive file: {e}"))?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(false);
        }
        response
            .error_for_status()
            .map_err(|e| format!("could not update Drive file: {e}"))?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_client(server: &tiny_http::Server) -> DriveClient {
        let base = format!("http://{}", server.server_addr());
        DriveClient::new(Client::new(), "test-token".into(), &base, &base)
    }

    #[test]
    fn creates_folder_with_parent_and_bearer_token() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let client = test_client(&server);
        let worker = std::thread::spawn(move || client.create_folder("Novel", Some("root")));
        let mut request = server.recv().unwrap();
        assert_eq!(request.method(), &tiny_http::Method::Post);
        assert!(request.url().starts_with("/files?"));
        assert_eq!(
            request
                .headers()
                .iter()
                .find(|h| h.field.equiv("authorization"))
                .unwrap()
                .value
                .as_str(),
            "Bearer test-token"
        );
        let mut body = String::new();
        request.as_reader().read_to_string(&mut body).unwrap();
        assert!(body.contains("\"name\":\"Novel\""));
        assert!(body.contains("\"parents\":[\"root\"]"));
        request
            .respond(tiny_http::Response::from_string(r#"{"id":"folder-1"}"#))
            .unwrap();
        assert_eq!(worker.join().unwrap().unwrap(), "folder-1");
    }

    #[test]
    fn missing_update_tells_caller_to_recreate() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let client = test_client(&server);
        let worker =
            std::thread::spawn(move || client.update_file("gone", "text/plain", b"hello".to_vec()));
        let request = server.recv().unwrap();
        assert!(request.url().starts_with("/files/gone?uploadType=media"));
        request.respond(tiny_http::Response::empty(404)).unwrap();
        assert!(!worker.join().unwrap().unwrap());
    }

    #[test]
    fn creates_file_as_drive_multipart_related() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let client = test_client(&server);
        let worker = std::thread::spawn(move || {
            client.create_file(
                "draft.md",
                "project-1",
                "text/markdown",
                b"chapter".to_vec(),
            )
        });
        let mut request = server.recv().unwrap();
        assert!(request
            .url()
            .starts_with("/files?uploadType=multipart&fields=id"));
        let content_type = request
            .headers()
            .iter()
            .find(|header| header.field.equiv("content-type"))
            .unwrap()
            .value
            .as_str()
            .to_owned();
        assert!(content_type.starts_with("multipart/related; boundary=inkwell-"));
        let mut body = Vec::new();
        request.as_reader().read_to_end(&mut body).unwrap();
        let text = String::from_utf8_lossy(&body);
        assert!(text.contains("\"name\":\"draft.md\""));
        assert!(text.contains("\"parents\":[\"project-1\"]"));
        assert!(text.contains("Content-Type: text/markdown\r\n\r\nchapter"));
        request
            .respond(tiny_http::Response::from_string(r#"{"id":"file-1"}"#))
            .unwrap();
        assert_eq!(worker.join().unwrap().unwrap(), "file-1");
    }
}
