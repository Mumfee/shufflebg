import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const BACKGROUND_SCHEMA = 'org.gnome.desktop.background';
// const INTERFACE_SCHEMA = 'org.gnome.desktop.interface'; // No longer needed for theme check

export default class ShuffleBGExtension extends Extension {
    _settings = null;
    _backgroundSettings = null;
    // _interfaceSettings = null; // No longer needed for theme check
    _timerId = null;
    _currentIndex = 0;
    _indicator = null;
    _startupCompleteSignal = null;

    enable() {
        this._settings = this.getSettings(); // Uses schema from metadata.json
        this._backgroundSettings = new Gio.Settings({ schema_id: BACKGROUND_SCHEMA });
        // this._interfaceSettings = new Gio.Settings({ schema_id: INTERFACE_SCHEMA }); // No longer needed

        if (this._settings.get_boolean('icon-tray')) {
            this._addTrayIcon();
        }
        // Connect to setting changes to add/remove icon dynamically
        this._settings.connect('changed::icon-tray', () => this._toggleTrayIcon());

        // Start wallpaper timer after GNOME Shell is fully loaded
        if (Main.layoutManager._startingUp) {
            this._startupCompleteSignal = Main.layoutManager.connect('startup-complete', () => {
                this._startupCompleteSignal = null; // Disconnect self
                this._onShellReady();
            });
        } else {
            this._onShellReady();
        }
    }

    disable() {
        this._stopTimer();

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._startupCompleteSignal) {
            Main.layoutManager.disconnect(this._startupCompleteSignal);
            this._startupCompleteSignal = null;
        }

        // Disconnect settings signals
        if (this._settings) {
            this._settings.disconnectObject(this);
            this._settings = null;
        }
        this._backgroundSettings = null;
        // this._interfaceSettings = null; // No longer needed
    }

    // ... (other functions like _onShellReady, _toggleTrayIcon, _addTrayIcon, _startTimer, _stopTimer, _resetTimerAndChangeWallpaper, _setRandomWallpaper remain the same) ...
    _onShellReady() {
        // Initial setup only after shell is ready
        this._setRandomWallpaper(true); // Set initial wallpaper
        this._startTimer(); // Start the timer
    }

     _toggleTrayIcon() {
        if (this._settings.get_boolean('icon-tray') && !this._indicator) {
            this._addTrayIcon();
        } else if (!this._settings.get_boolean('icon-tray') && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _addTrayIcon() {
        if (this._indicator) {
             console.warn('ShuffleBGExtension: Tray icon already exists.');
             return; // Avoid adding multiple icons
        }
        this._indicator = new PanelMenu.Button(0.0, _('ShuffleBG'), false);
        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(this.path + '/icon.svg'), // Ensure the icon exists
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);
        this._indicator.connect('button-press-event', () => this._resetTimerAndChangeWallpaper());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    _startTimer() {
        // Stop existing timer before starting a new one
        this._stopTimer();
        const interval = this._settings.get_double('interval') * 1000; // Convert seconds to milliseconds
        if (interval > 0) {
             this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
                this._setRandomWallpaper();
                return GLib.SOURCE_CONTINUE; // Keep timer running
             });
        } else {
            console.warn('ShuffleBGExtension: Timer interval is zero or negative, timer not started.');
        }
    }

    _stopTimer() {
        if (this._timerId !== null) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }

    _resetTimerAndChangeWallpaper() {
        // No need to stop timer here, _startTimer handles it
        this._setRandomWallpaper();
        this._startTimer(); // Restart timer to reset the interval count
    }

    _setRandomWallpaper(isStartup = false) {
        let folderPath = this._settings.get_string('folder-path');
        // Handle ~ expansion more reliably
        if (folderPath.startsWith('~')) {
            folderPath = GLib.get_home_dir() + folderPath.substring(1);
        }
        const dir = Gio.File.new_for_path(folderPath);

        if (!dir.query_exists(null)) {
            // Use console.warn or console.error for issues
            console.warn(`ShuffleBGExtension: Folder not found: ${folderPath}`);
            return;
        }

        let files = [];
        try {
            const enumerator = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                // Ensure it's a file before checking the name pattern
                if (info.get_file_type() === Gio.FileType.REGULAR) {
                     const name = info.get_name();
                     // Case-insensitive match for common image extensions
                     if (name.match(/\.(jpg|jpeg|png|bmp|gif|webp|svg)$/i)) {
                         files.push(GLib.build_filenamev([folderPath, name]));
                     }
                }
            }
            enumerator.close(null); // Close the enumerator
        } catch (e) {
             console.error(`ShuffleBGExtension: Error reading folder ${folderPath}: ${e.message}`);
             return;
        }


        if (files.length === 0) {
            console.warn(`ShuffleBGExtension: No valid images found in folder: ${folderPath}`);
            return;
        }

        let wallpaperPath;
        if (this._settings.get_boolean('randomize')) {
            wallpaperPath = files[Math.floor(Math.random() * files.length)];
        } else {
            if (this._currentIndex >= files.length || this._currentIndex < 0) {
                this._currentIndex = 0; // Reset index safely
            }
            wallpaperPath = files[this._currentIndex];
            this._currentIndex = (this._currentIndex + 1) % files.length; // Loop index
        }

        this._applyWallpaper(wallpaperPath, isStartup);
    }


    /**
     * Applies the selected wallpaper to both light and dark theme settings.
     *
     * @param {string} wallpaperPath - The absolute path to the wallpaper image.
     * @param {boolean} [isStartup=false] - Whether this is the initial run on startup.
     */
    _applyWallpaper(wallpaperPath, isStartup = false) {
        // Define the keys for both light and dark mode wallpapers
        const wallpaperKeyLight = 'picture-uri';
        const wallpaperKeyDark = 'picture-uri-dark';
        const pictureOptionsKey = 'picture-options';

        try {
             // Convert path to file URI
            const wallpaperUri = Gio.File.new_for_path(wallpaperPath).get_uri();

            // Set the wallpaper URI for BOTH light and dark modes
            this._backgroundSettings.set_string(wallpaperKeyLight, wallpaperUri);
            this._backgroundSettings.set_string(wallpaperKeyDark, wallpaperUri);

            // Use console.log for successful operations
            console.log(`ShuffleBGExtension: Wallpaper set for both themes to ${wallpaperUri}`);

            // Optionally set picture-options on startup or if needed
            if (isStartup) {
                // Example: Set picture-options, ensure 'zoom' is a valid value
                // Check valid values with: gsettings range org.gnome.desktop.background picture-options
                 this._backgroundSettings.set_string(pictureOptionsKey, 'zoom'); // 'zoom' is often preferred
                 console.log(`ShuffleBGExtension: Picture options set to 'zoom'`);
            }

        } catch (e) {
            // Use console.error for errors
            console.error(`ShuffleBGExtension: Error setting wallpaper: ${e.message}`);
            console.error(`Wallpaper Path: ${wallpaperPath}`);
        }
    }
}
