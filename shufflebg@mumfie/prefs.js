import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; // Correct import for _

// Helper function to shorten path with ~
// Corrected function definition: removed the stray "_" before the name
function abbreviatePath(path) {
    if (!path) return ''; // Handle null/empty paths gracefully
    const homeDir = GLib.get_home_dir();
    if (path.startsWith(homeDir)) {
        // Ensure we don't just get "~" if path IS homeDir
        if (path.length > homeDir.length) {
             return '~' + path.substring(homeDir.length);
        } else {
            return '~';
        }
    }
    return path;
}

// Helper function to expand path with ~
function expandPath(path) {
    if (!path) return ''; // Handle null/empty paths gracefully
    if (path.startsWith('~')) {
        // Handle "~/" or just "~"
        const subPath = path.length > 1 ? path.substring(1) : '';
        return GLib.build_filenamev([GLib.get_home_dir(), subPath]);
    }
    return path;
}


export default class ShuffleBGPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._window = window;

        // Create Preferences Page
        const page = new Adw.PreferencesPage({
            title: _('Shuffle Background Settings'),
            icon_name: 'preferences-desktop-wallpaper-symbolic',
        });
        window.add(page);

        // --- General Settings Group ---
        const generalGroup = new Adw.PreferencesGroup({
            title: _('General Settings'),
            description: _('Configure wallpaper change behavior'),
        });
        page.add(generalGroup);

        // **Folder Path Selection**
        const folderRow = new Adw.ActionRow({
            title: _('Wallpaper Folder'),
        });
        generalGroup.add(folderRow);

        const currentPath = this._settings.get_string('folder-path');
        // Use the corrected helper function name here
        folderRow.set_subtitle(abbreviatePath(currentPath) || _('None selected'));

        const folderButton = new Gtk.Button({
            label: _('Choose Folder...'),
            valign: Gtk.Align.CENTER,
            hexpand: false,
        });

        folderButton.connect('clicked', () => {
            // Pass the row to update its subtitle
            this._showFolderChooser(folderRow);
        });

        folderRow.add_suffix(folderButton);
        folderRow.activatable_widget = folderButton;


        // **Interval Selection** (Using Adw.SpinRow)
        const intervalRow = new Adw.SpinRow({
            title: _('Change Interval'),
            subtitle: _('Time between wallpaper changes (seconds)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 86400,
                step_increment: 1,
                page_increment: 60,
                value: this._settings.get_double('interval')
            }),
            digits: 0,
        });
        generalGroup.add(intervalRow);
        this._settings.bind('interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);


        // **Icon Tray Toggle** (Using Adw.SwitchRow)
        const iconTrayRow = new Adw.SwitchRow({
            title: _('Show Tray Icon'),
            subtitle: _('Toggle the icon in the top panel'),
        });
        generalGroup.add(iconTrayRow);
        this._settings.bind('icon-tray', iconTrayRow, 'active', Gio.SettingsBindFlags.DEFAULT);


        // **Randomize Toggle** (Using Adw.SwitchRow)
        const randomizeRow = new Adw.SwitchRow({
            title: _('Randomize Wallpapers'),
            subtitle: _('Shuffle wallpapers instead of cycling in order'),
        });
        generalGroup.add(randomizeRow);
        this._settings.bind('randomize', randomizeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _showFolderChooser(folderRow) { // Accept folderRow as argument
        const dialog = new Gtk.FileChooserNative({
            title: _('Select Wallpaper Folder'),
            transient_for: this._window,
            modal: true,
            action: Gtk.FileChooserAction.SELECT_FOLDER,
            accept_label: _('_Select'),
            cancel_label: _('_Cancel'),
        });

        try {
             // Use the corrected helper function name here
            const currentFolder = expandPath(this._settings.get_string('folder-path'));
            const folderFile = Gio.File.new_for_path(currentFolder);
            if (folderFile.query_exists(null)) {
                dialog.set_current_folder(folderFile);
            } else {
                 dialog.set_current_folder(Gio.File.new_for_path(GLib.get_home_dir()));
            }
        } catch (e) {
             console.error(`ShuffleBG Prefs: Error setting initial folder for dialog: ${e.message}`);
             dialog.set_current_folder(Gio.File.new_for_path(GLib.get_home_dir()));
        }

        dialog.connect('response', (dlg, response_id) => {
            if (response_id === Gtk.ResponseType.ACCEPT) {
                const file = dialog.get_file();
                if (file) {
                    const path = file.get_path();
                    this._settings.set_string('folder-path', path);
                     // Use the corrected helper function name here
                    folderRow.set_subtitle(abbreviatePath(path)); // Update the specific row's subtitle
                }
            }
            dialog.destroy();
        });

        dialog.show();
    }
}
