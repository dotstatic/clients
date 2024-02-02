import { Component, NgZone } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom, switchMap } from "rxjs";

import { LockComponent as BaseLockComponent } from "@bitwarden/angular/auth/components/lock.component";
import { PinCryptoServiceAbstraction } from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { VaultTimeoutSettingsService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout-settings.service";
import { VaultTimeoutService } from "@bitwarden/common/abstractions/vault-timeout/vault-timeout.service";
import { PolicyApiServiceAbstraction } from "@bitwarden/common/admin-console/abstractions/policy/policy-api.service.abstraction";
import { InternalPolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { DeviceTrustCryptoServiceAbstraction } from "@bitwarden/common/auth/abstractions/device-trust-crypto.service.abstraction";
import { UserVerificationService } from "@bitwarden/common/auth/abstractions/user-verification/user-verification.service.abstraction";
import { DeviceType } from "@bitwarden/common/enums";
import { BroadcasterService } from "@bitwarden/common/platform/abstractions/broadcaster.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { BiometricStateService } from "@bitwarden/common/platform/biometrics/biometric-state.service";
import { PasswordStrengthServiceAbstraction } from "@bitwarden/common/tools/password-strength";
import { DialogService } from "@bitwarden/components";

import { ElectronCryptoService } from "../platform/services/electron-crypto.service";
import { getPlatform } from "../utils";

const BroadcasterSubscriptionId = "LockComponent";

@Component({
  selector: "app-lock",
  templateUrl: "lock.component.html",
})
export class LockComponent extends BaseLockComponent {
  private deferFocus: boolean = null;
  protected biometricReady = false;
  private biometricAsked = false;
  private autoPromptBiometric = false;

  constructor(
    router: Router,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    messagingService: MessagingService,
    protected override cryptoService: ElectronCryptoService,
    vaultTimeoutService: VaultTimeoutService,
    vaultTimeoutSettingsService: VaultTimeoutSettingsService,
    environmentService: EnvironmentService,
    protected override stateService: StateService,
    apiService: ApiService,
    private route: ActivatedRoute,
    private broadcasterService: BroadcasterService,
    ngZone: NgZone,
    policyApiService: PolicyApiServiceAbstraction,
    policyService: InternalPolicyService,
    passwordStrengthService: PasswordStrengthServiceAbstraction,
    logService: LogService,
    dialogService: DialogService,
    deviceTrustCryptoService: DeviceTrustCryptoServiceAbstraction,
    userVerificationService: UserVerificationService,
    pinCryptoService: PinCryptoServiceAbstraction,
    biometricStateService: BiometricStateService,
  ) {
    super(
      router,
      i18nService,
      platformUtilsService,
      messagingService,
      cryptoService,
      vaultTimeoutService,
      vaultTimeoutSettingsService,
      environmentService,
      stateService,
      apiService,
      logService,
      ngZone,
      policyApiService,
      policyService,
      passwordStrengthService,
      dialogService,
      deviceTrustCryptoService,
      userVerificationService,
      pinCryptoService,
      biometricStateService,
    );
  }

  async ngOnInit() {
    await super.ngOnInit();
    this.autoPromptBiometric = await firstValueFrom(
      this.biometricStateService.promptAutomatically$,
    );
    this.biometricReady = await this.canUseBiometric();

    await this.displayBiometricUpdateWarning();

    this.delayedAskForBiometric(500);
    this.route.queryParams.pipe(switchMap((params) => this.delayedAskForBiometric(500, params)));

    this.broadcasterService.subscribe(BroadcasterSubscriptionId, async (message: any) => {
      this.ngZone.run(() => {
        switch (message.command) {
          case "windowHidden":
            this.onWindowHidden();
            break;
          case "windowIsFocused":
            if (this.deferFocus === null) {
              this.deferFocus = !message.windowIsFocused;
              if (!this.deferFocus) {
                this.focusInput();
              }
            } else if (this.deferFocus && message.windowIsFocused) {
              this.focusInput();
              this.deferFocus = false;
            }
            break;
          default:
        }
      });
    });
    this.messagingService.send("getWindowIsFocused");
  }

  ngOnDestroy() {
    super.ngOnDestroy();
    this.broadcasterService.unsubscribe(BroadcasterSubscriptionId);
  }

  onWindowHidden() {
    this.showPassword = false;
  }

  private async delayedAskForBiometric(delay: number, params?: any) {
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (params && !params.promptBiometric) {
      return;
    }

    if (!this.supportsBiometric || !this.autoPromptBiometric || this.biometricAsked) {
      return;
    }

    if (await firstValueFrom(this.biometricStateService.promptCancelled$)) {
      return;
    }

    this.biometricAsked = true;
    if (await ipc.platform.isWindowVisible()) {
      this.unlockBiometric();
    }
  }

  private async canUseBiometric() {
    const userId = await this.stateService.getUserId();
    return await ipc.platform.biometric.enabled(userId);
  }

  private focusInput() {
    document.getElementById(this.pinEnabled ? "pin" : "masterPassword")?.focus();
  }

  private async displayBiometricUpdateWarning(): Promise<void> {
    if (await firstValueFrom(this.biometricStateService.dismissedRequirePasswordOnStartCallout$)) {
      return;
    }

    if (this.platformUtilsService.getDevice() !== DeviceType.WindowsDesktop) {
      return;
    }

    if (await this.stateService.getBiometricUnlock()) {
      const response = await this.dialogService.openSimpleDialog({
        title: { key: "windowsBiometricUpdateWarningTitle" },
        content: { key: "windowsBiometricUpdateWarning" },
        type: "warning",
      });

      if (response) {
        await this.cryptoService.setBiometricClientKeyHalf();
        await this.stateService.setDisableAutoBiometricsPrompt(true);
      }
      this.supportsBiometric = await this.canUseBiometric();
      await this.biometricStateService.setDismissedRequirePasswordOnStartCallout();
    }
  }

  get biometricText() {
    switch (getPlatform()) {
      case "mac":
        return "unlockWithTouchId";
      case "windows":
        return "unlockWithWindowsHello";
      default:
        throw new Error("Unsupported platform");
    }
  }
}
