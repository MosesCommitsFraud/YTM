import { createSignal, createEffect, onCleanup } from 'solid-js';
import { UpdateDialog, UpdateDialogProps } from './UpdateDialog';

type DialogState = Omit<UpdateDialogProps, 'open' | 'onClose' | 'onPrimary' | 'onSecondary' | 'onTertiary'> & {
  onPrimary?: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
};

const [dialogState, setDialogState] = createSignal<DialogState | null>(null);
const [isOpen, setIsOpen] = createSignal(false);

// Global dialog functions that can be called from anywhere
export const updateDialogManager = {
  showDialog: (state: DialogState) => {
    setDialogState(state);
    setIsOpen(true);
  },
  
  closeDialog: () => {
    setIsOpen(false);
    setTimeout(() => setDialogState(null), 300); // Wait for animation
  },
  
  updateProgress: (progress: DialogState['progress']) => {
    const current = dialogState();
    if (current && current.type === 'download-progress') {
      setDialogState({ ...current, progress });
    }
  },
};

// Component that renders the current dialog
export const UpdateDialogManager = () => {
  const state = dialogState();
  
  // Listen for IPC events from main process
  createEffect(() => {
    if (typeof window !== 'undefined' && window.ipcRenderer) {
      const handleUpdateAvailable = (_: any, info: { version: string }) => {
        updateDialogManager.showDialog({
          type: 'update-available',
          title: 'Update Available',
          message: `A new version (${info.version}) is available. Would you like to download and install it now?`,
          detail: 'The app will automatically restart after the update is installed.',
          version: info.version,
          onPrimary: () => {
            window.ipcRenderer.send('update-download-start');
            updateDialogManager.closeDialog();
          },
          onSecondary: () => {
            updateDialogManager.closeDialog();
          },
          onTertiary: () => {
            window.ipcRenderer.send('update-disable');
            updateDialogManager.closeDialog();
          },
        });
      };

      const handleUpdateDownloaded = (_: any, info: { version: string }) => {
        updateDialogManager.showDialog({
          type: 'update-ready',
          title: 'Update Ready',
          message: `Update to version ${info.version} has been downloaded and is ready to install.`,
          detail: 'The application will restart to apply the update.',
          version: info.version,
          onPrimary: () => {
            window.ipcRenderer.send('update-install-now');
            updateDialogManager.closeDialog();
          },
          onSecondary: () => {
            updateDialogManager.closeDialog();
          },
        });
      };

      const handleDownloadProgress = (_: any, progressObj: { percent: number, bytesPerSecond: number, transferred: number, total: number }) => {
        const current = dialogState();
        if (current?.type === 'download-progress') {
          updateDialogManager.updateProgress(progressObj);
        } else {
          updateDialogManager.showDialog({
            type: 'download-progress',
            title: 'Downloading Update',
            message: 'Update is being downloaded...',
            detail: 'Please wait while the update is downloaded in the background.',
            progress: progressObj,
            onSecondary: () => {
              window.ipcRenderer.send('update-download-cancel');
              updateDialogManager.closeDialog();
            },
          });
        }
      };

      const handleUpdateError = (_: any, error: { message: string }) => {
        updateDialogManager.showDialog({
          type: 'error',
          title: 'Update Error',
          message: 'An error occurred while checking for updates.',
          detail: error.message || 'Unknown error occurred.',
          onPrimary: () => {
            updateDialogManager.closeDialog();
          },
        });
      };

      const handleCheckingForUpdate = () => {
        updateDialogManager.showDialog({
          type: 'checking',
          title: 'Checking for Updates',
          message: 'Checking for updates...',
          detail: 'Please wait while we check for available updates.',
          onPrimary: () => {
            updateDialogManager.closeDialog();
          },
        });
      };

      const handleNoUpdateAvailable = (_: any, info: { version: string }) => {
        updateDialogManager.showDialog({
          type: 'no-update',
          title: 'No Updates Available',
          message: 'You are running the latest version.',
          detail: `Current version: ${info.version}`,
          onPrimary: () => {
            updateDialogManager.closeDialog();
          },
        });
      };

      // Register IPC listeners
      window.ipcRenderer.on('update-available-dialog', handleUpdateAvailable);
      window.ipcRenderer.on('update-downloaded-dialog', handleUpdateDownloaded);
      window.ipcRenderer.on('download-progress-dialog', handleDownloadProgress);
      window.ipcRenderer.on('update-error-dialog', handleUpdateError);
      window.ipcRenderer.on('checking-for-update-dialog', handleCheckingForUpdate);
      window.ipcRenderer.on('no-update-available-dialog', handleNoUpdateAvailable);

      // Cleanup listeners
      onCleanup(() => {
        window.ipcRenderer.removeListener('update-available-dialog', handleUpdateAvailable);
        window.ipcRenderer.removeListener('update-downloaded-dialog', handleUpdateDownloaded);
        window.ipcRenderer.removeListener('download-progress-dialog', handleDownloadProgress);
        window.ipcRenderer.removeListener('update-error-dialog', handleUpdateError);
        window.ipcRenderer.removeListener('checking-for-update-dialog', handleCheckingForUpdate);
        window.ipcRenderer.removeListener('no-update-available-dialog', handleNoUpdateAvailable);
      });
    }
  });

  if (!state) return null;

  return (
    <UpdateDialog
      open={isOpen()}
      {...state}
      onClose={updateDialogManager.closeDialog}
      onPrimary={state.onPrimary}
      onSecondary={state.onSecondary}
      onTertiary={state.onTertiary}
    />
  );
};
