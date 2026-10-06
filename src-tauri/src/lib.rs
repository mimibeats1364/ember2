//! Capa nativa de Ember.
//!
//! Responsabilidades (todo lo demás vive en la capa web compartida):
//! - Barra de menús de macOS / bandeja de Windows con las tareas de hoy y acceso a Focus.
//! - Ventana de captura rápida invocable con un atajo global.
//! - Menú de aplicación en español.
//! - Cerrar la ventana principal la oculta (la app sigue viva en la barra de menús).

use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const TRAY_ID: &str = "ember-tray";
const MAIN: &str = "main";
const CAPTURE: &str = "capture";

#[derive(Deserialize, Clone)]
struct TrayTask {
    id: String,
    title: String,
    time: Option<String>,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct TrayState {
    tasks: Vec<TrayTask>,
    focus_running: bool,
    focus_label: Option<String>,
}

/// Acción enviada a la ventana principal desde menús nativos.
#[derive(Serialize, Clone)]
struct NativeAction {
    action: String,
    id: Option<String>,
}

fn emit_action<R: Runtime>(app: &AppHandle<R>, action: &str, id: Option<String>) {
    let _ = app.emit_to(
        MAIN,
        "ember://native",
        NativeAction {
            action: action.to_string(),
            id,
        },
    );
}

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_capture_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(CAPTURE) {
        if w.is_visible()? && w.is_focused()? {
            w.hide()?;
        } else {
            w.center()?;
            w.show()?;
            w.set_focus()?;
            w.emit("ember://capture-shown", ())?;
        }
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(app, CAPTURE, WebviewUrl::App("index.html".into()))
        .title("Captura rápida")
        .inner_size(660.0, 236.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .center()
        .focused(true)
        .build()?;
    let handle = w.clone();
    w.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let _ = handle.hide();
        }
    });
    Ok(())
}

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>, state: &TrayState) -> tauri::Result<Menu<R>> {
    let mut b = MenuBuilder::new(app);
    b = b.item(&MenuItemBuilder::with_id("capture", "Captura rápida…").build(app)?);
    let focus_label = if state.focus_running {
        state
            .focus_label
            .clone()
            .unwrap_or_else(|| "Pausar / reanudar Focus".to_string())
    } else {
        "Iniciar Focus (25 min)".to_string()
    };
    let focus_id = if state.focus_running { "focus_toggle" } else { "focus_start" };
    b = b.item(&MenuItemBuilder::with_id(focus_id, focus_label).build(app)?);
    b = b.separator();
    b = b.item(&MenuItemBuilder::with_id("today_header", "Hoy").enabled(false).build(app)?);
    if state.tasks.is_empty() {
        b = b.item(
            &MenuItemBuilder::with_id("today_empty", "Nada pendiente para hoy")
                .enabled(false)
                .build(app)?,
        );
    } else {
        for t in state.tasks.iter().take(8) {
            let label = match &t.time {
                Some(time) => format!("{time}  {}", t.title),
                None => format!("○  {}", t.title),
            };
            b = b.item(&MenuItemBuilder::with_id(format!("task:{}", t.id), label).build(app)?);
        }
    }
    b = b.separator();
    b = b.item(&MenuItemBuilder::with_id("open", "Abrir Ember").build(app)?);
    b = b.item(&PredefinedMenuItem::quit(app, Some("Salir de Ember"))?);
    b.build()
}

fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Ember")
        .item(&PredefinedMenuItem::about(app, Some("Acerca de Ember"), None)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("settings", "Ajustes…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("Servicios"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Ocultar Ember"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Ocultar otros"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Mostrar todo"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Salir de Ember"))?)
        .build()?;
    let file = SubmenuBuilder::new(app, "Archivo")
        .item(
            &MenuItemBuilder::with_id("new_task", "Nueva tarea")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id("capture", "Captura rápida").build(app)?)
        .item(
            &MenuItemBuilder::with_id("palette", "Paleta de comandos")
                .accelerator("CmdOrCtrl+K")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Cerrar ventana"))?)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edición")
        .item(&PredefinedMenuItem::undo(app, Some("Deshacer"))?)
        .item(&PredefinedMenuItem::redo(app, Some("Rehacer"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Cortar"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copiar"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Pegar"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("Seleccionar todo"))?)
        .build()?;
    let view = SubmenuBuilder::new(app, "Visualización")
        .item(&MenuItemBuilder::with_id("go:today", "Hoy").accelerator("CmdOrCtrl+1").build(app)?)
        .item(&MenuItemBuilder::with_id("go:tasks", "Tareas").accelerator("CmdOrCtrl+2").build(app)?)
        .item(&MenuItemBuilder::with_id("go:calendar", "Calendario").accelerator("CmdOrCtrl+3").build(app)?)
        .item(&MenuItemBuilder::with_id("go:habits", "Hábitos").accelerator("CmdOrCtrl+4").build(app)?)
        .item(&MenuItemBuilder::with_id("go:focus", "Focus").accelerator("CmdOrCtrl+5").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("Pantalla completa"))?)
        .build()?;
    let window = SubmenuBuilder::new(app, "Ventana")
        .item(&PredefinedMenuItem::minimize(app, Some("Minimizar"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("Zoom"))?)
        .build()?;
    MenuBuilder::new(app)
        .items(&[&app_menu, &file, &edit, &view, &window])
        .build()
}

#[tauri::command]
fn update_tray(app: AppHandle, state: TrayState) -> Result<(), String> {
    let menu = build_tray_menu(&app, &state).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Texto junto al icono de la barra de menús (macOS). Se usa para la cuenta atrás de Focus.
#[tauri::command]
fn set_tray_title(app: AppHandle, title: Option<String>) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_title(title.as_deref()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_capture(app: AppHandle) -> Result<(), String> {
    toggle_capture_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_capture(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(CAPTURE) {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    show_main(&app);
}

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }));
    }

    builder = builder
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_denylist(&[CAPTURE])
                    .build(),
            );
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            update_tray,
            set_tray_title,
            toggle_capture,
            hide_capture,
            show_main_window
        ])
        .menu(|app| build_app_menu(app))
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            match id.as_str() {
                "open" => show_main(app),
                "capture" => {
                    let _ = toggle_capture_window(app);
                }
                "settings" | "new_task" | "palette" => {
                    show_main(app);
                    emit_action(app, &id, None);
                }
                "focus_start" | "focus_toggle" => emit_action(app, &id, None),
                other => {
                    if let Some(task_id) = other.strip_prefix("task:") {
                        show_main(app);
                        emit_action(app, "open_task", Some(task_id.to_string()));
                    } else if let Some(route) = other.strip_prefix("go:") {
                        show_main(app);
                        emit_action(app, "go", Some(route.to_string()));
                    }
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_tray_menu(&handle, &TrayState::default())?;
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("Ember")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Cerrar la ventana principal la oculta: Ember sigue en la barra de menús
            // para recordatorios, Focus y captura rápida. Se sale con ⌘Q o desde el menú.
            if window.label() == MAIN {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error al iniciar Ember");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            show_main(app);
        }
        let _ = (app, event);
    });
}
