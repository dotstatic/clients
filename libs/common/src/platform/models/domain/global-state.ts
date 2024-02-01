import { WindowState } from "../../../models/domain/window-state";
import { ThemeType } from "../../enums";

export class GlobalState {
  enableAlwaysOnTop?: boolean;
  installedVersion?: string;
  locale?: string;
  organizationInvitation?: any;
  ssoCodeVerifier?: string;
  ssoOrganizationIdentifier?: string;
  ssoState?: string;
  rememberedEmail?: string;
  theme?: ThemeType = ThemeType.System;
  window?: WindowState = new WindowState();
  twoFactorToken?: string;
  disableFavicon?: boolean;
  biometricFingerprintValidated?: boolean;
  vaultTimeout?: number;
  vaultTimeoutAction?: string;
  loginRedirect?: any;
  mainWindowSize?: number;
  enableTray?: boolean;
  enableMinimizeToTray?: boolean;
  enableCloseToTray?: boolean;
  enableStartToTray?: boolean;
  openAtLogin?: boolean;
  alwaysShowDock?: boolean;
  enableBrowserIntegration?: boolean;
  enableBrowserIntegrationFingerprint?: boolean;
  enableDuckDuckGoBrowserIntegration?: boolean;
  neverDomains?: { [id: string]: unknown };
  enablePasskeys?: boolean;
  disableAddLoginNotification?: boolean;
  disableChangedPasswordNotification?: boolean;
  disableContextMenuItem?: boolean;
  autoFillOverlayVisibility?: number;
  deepLinkRedirectUrl?: string;
}
