import { distinctUntilChanged, firstValueFrom, map, Observable, shareReplay } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AuthRequestCryptoServiceAbstraction } from "@bitwarden/common/auth/abstractions/auth-request-crypto.service.abstraction";
import { DeviceTrustCryptoServiceAbstraction } from "@bitwarden/common/auth/abstractions/device-trust-crypto.service.abstraction";
import { KeyConnectorService } from "@bitwarden/common/auth/abstractions/key-connector.service";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { TwoFactorService } from "@bitwarden/common/auth/abstractions/two-factor.service";
import { AuthenticationType } from "@bitwarden/common/auth/enums/authentication-type";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { KdfConfig } from "@bitwarden/common/auth/models/domain/kdf-config";
import { TokenTwoFactorRequest } from "@bitwarden/common/auth/models/request/identity-token/token-two-factor.request";
import { PasswordlessAuthRequest } from "@bitwarden/common/auth/models/request/passwordless-auth.request";
import { AuthRequestResponse } from "@bitwarden/common/auth/models/response/auth-request.response";
import { PreloginRequest } from "@bitwarden/common/models/request/prelogin.request";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { AuthRequestPushNotification } from "@bitwarden/common/models/response/notification.response";
import { AppIdService } from "@bitwarden/common/platform/abstractions/app-id.service";
import { CryptoService } from "@bitwarden/common/platform/abstractions/crypto.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { KdfType } from "@bitwarden/common/platform/enums";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import {
  GlobalState,
  KeyDefinition,
  LOGIN_STRATEGY_MEMORY,
  StateProvider,
} from "@bitwarden/common/platform/state";
import { PasswordStrengthServiceAbstraction } from "@bitwarden/common/tools/password-strength";
import { MasterKey } from "@bitwarden/common/types/key";

import { LoginStrategyServiceAbstraction } from "../../abstractions";
import {
  AuthRequestLoginStrategy,
  AuthRequestLoginStrategyData,
} from "../../login-strategies/auth-request-login.strategy";
import {
  PasswordLoginStrategy,
  PasswordLoginStrategyData,
} from "../../login-strategies/password-login.strategy";
import { SsoLoginStrategy, SsoLoginStrategyData } from "../../login-strategies/sso-login.strategy";
import {
  UserApiLoginStrategy,
  UserApiLoginStrategyData,
} from "../../login-strategies/user-api-login.strategy";
import {
  WebAuthnLoginStrategy,
  WebAuthnLoginStrategyData,
} from "../../login-strategies/webauthn-login.strategy";
import {
  UserApiLoginCredentials,
  PasswordLoginCredentials,
  SsoLoginCredentials,
  AuthRequestLoginCredentials,
  WebAuthnLoginCredentials,
} from "../../models";

type DataTypes =
  | PasswordLoginStrategyData
  | SsoLoginStrategyData
  | UserApiLoginStrategyData
  | AuthRequestLoginStrategyData
  | WebAuthnLoginStrategyData;

const CURRENT_LOGIN_STRATEGY_KEY = new KeyDefinition<AuthenticationType | null>(
  LOGIN_STRATEGY_MEMORY,
  "currentLoginStrategy",
  {
    deserializer: (data) => data,
  },
);

const LOGIN_STRATEGY_CACHE_KEY = new KeyDefinition<DataTypes | null>(
  LOGIN_STRATEGY_MEMORY,
  "loginStrategyCache",
  {
    deserializer: (data) => {
      if (data == null) {
        return null;
      }
      switch (data.type) {
        case AuthenticationType.Password:
          return PasswordLoginStrategyData.fromJSON(data);
        case AuthenticationType.Sso:
          return SsoLoginStrategyData.fromJSON(data);
        case AuthenticationType.UserApi:
          return UserApiLoginStrategyData.fromJSON(data);
        case AuthenticationType.AuthRequest:
          return AuthRequestLoginStrategyData.fromJSON(data);
        case AuthenticationType.WebAuthn:
          return WebAuthnLoginStrategyData.fromJSON(data);
      }
    },
  },
);

const LOGIN_STRATEGY_CACHE_EXPIRATION = new KeyDefinition<Date | null>(
  LOGIN_STRATEGY_MEMORY,
  "loginStrategyCacheExpiration",
  {
    deserializer: (data) => (data ? null : new Date(data)),
  },
);

const AUTH_REQUEST_PUSH_NOTIFICATION = new KeyDefinition<string>(
  LOGIN_STRATEGY_MEMORY,
  "authRequestPushNotification",
  {
    deserializer: (data) => data,
  },
);

const sessionTimeoutLength = 2 * 60 * 1000; // 2 minutes

export class LoginStrategyService implements LoginStrategyServiceAbstraction {
  private currentAuthTypeState: GlobalState<AuthenticationType | null>;
  private loginStrategyCacheState: GlobalState<DataTypes | null>;
  private loginStrategyCacheExpirationState: GlobalState<Date | null>;
  private authRequestPushNotificationState: GlobalState<string>;

  private sessionTimeout: any;

  private loginStrategy$: Observable<
    | UserApiLoginStrategy
    | PasswordLoginStrategy
    | SsoLoginStrategy
    | AuthRequestLoginStrategy
    | WebAuthnLoginStrategy
    | null
  >;

  currentAuthType$: Observable<AuthenticationType | null>;

  authRequestPushNotification$: Observable<string>;

  constructor(
    protected cryptoService: CryptoService,
    protected apiService: ApiService,
    protected tokenService: TokenService,
    protected appIdService: AppIdService,
    protected platformUtilsService: PlatformUtilsService,
    protected messagingService: MessagingService,
    protected logService: LogService,
    protected keyConnectorService: KeyConnectorService,
    protected environmentService: EnvironmentService,
    protected stateService: StateService,
    protected twoFactorService: TwoFactorService,
    protected i18nService: I18nService,
    protected encryptService: EncryptService,
    protected passwordStrengthService: PasswordStrengthServiceAbstraction,
    protected policyService: PolicyService,
    protected deviceTrustCryptoService: DeviceTrustCryptoServiceAbstraction,
    protected authReqCryptoService: AuthRequestCryptoServiceAbstraction,
    protected stateProvider: StateProvider,
  ) {
    this.currentAuthTypeState = this.stateProvider.getGlobal(CURRENT_LOGIN_STRATEGY_KEY);
    this.loginStrategyCacheState = this.stateProvider.getGlobal(LOGIN_STRATEGY_CACHE_KEY);
    this.loginStrategyCacheExpirationState = this.stateProvider.getGlobal(
      LOGIN_STRATEGY_CACHE_EXPIRATION,
    );
    this.authRequestPushNotificationState = this.stateProvider.getGlobal(
      AUTH_REQUEST_PUSH_NOTIFICATION,
    );

    this.currentAuthType$ = this.currentAuthTypeState.state$;
    this.authRequestPushNotification$ = this.authRequestPushNotificationState.state$;
    this.loginStrategy$ = this.currentAuthTypeState.state$.pipe(
      distinctUntilChanged(),
      this.initializeLoginStrategy.bind(this),
      shareReplay({ refCount: true, bufferSize: 1 }),
    );
  }

  async getEmail(): Promise<string | null> {
    const strategy = await firstValueFrom(this.loginStrategy$);

    if ("email$" in strategy) {
      return await firstValueFrom(strategy.email$);
    }
    return null;
  }

  async getMasterPasswordHash(): Promise<string | null> {
    const strategy = await firstValueFrom(this.loginStrategy$);

    if ("masterKeyHash$" in strategy) {
      return await firstValueFrom(strategy.masterKeyHash$);
    }
    return null;
  }

  async getSsoEmail2FaSessionToken(): Promise<string | null> {
    const strategy = await firstValueFrom(this.loginStrategy$);

    if ("ssoEmail2FaSessionToken$" in strategy) {
      return await firstValueFrom(strategy.ssoEmail2FaSessionToken$);
    }
    return null;
  }

  async getAccessCode(): Promise<string | null> {
    const strategy = await firstValueFrom(this.loginStrategy$);

    if ("accessCode$" in strategy) {
      return await firstValueFrom(strategy.accessCode$);
    }
    return null;
  }

  async getAuthRequestId(): Promise<string | null> {
    const strategy = await firstValueFrom(this.loginStrategy$);

    if ("authRequestId$" in strategy) {
      return await firstValueFrom(strategy.authRequestId$);
    }
    return null;
  }

  async logIn(
    credentials:
      | UserApiLoginCredentials
      | PasswordLoginCredentials
      | SsoLoginCredentials
      | AuthRequestLoginCredentials
      | WebAuthnLoginCredentials,
  ): Promise<AuthResult> {
    this.clearCache();

    await this.currentAuthTypeState.update((_) => credentials.type);

    const strategy = await firstValueFrom(this.loginStrategy$);

    // Note: We aren't passing the credentials directly to the strategy since they are
    // created in the popup and can cause DeadObject references on Firefox.
    // This is a shallow copy, but use deep copy in future if objects are added to credentials
    // that were created in popup.
    // If the popup uses its own instance of this service, this can be removed.
    const ownedCredentials = { ...credentials };

    const result = await strategy.logIn(ownedCredentials as any);

    if (result != null && !result.requiresTwoFactor) {
      await this.clearCache();
    } else {
      await this.startSessionTimeout();
    }

    return result;
  }

  async logInTwoFactor(
    twoFactor: TokenTwoFactorRequest,
    captchaResponse: string,
  ): Promise<AuthResult> {
    if (!(await this.isSessionValid())) {
      throw new Error(this.i18nService.t("sessionTimeout"));
    }

    const strategy = await firstValueFrom(this.loginStrategy$);
    if (strategy == null) {
      throw new Error("No login strategy found.");
    }

    try {
      const result = await strategy.logInTwoFactor(twoFactor, captchaResponse);

      // Only clear cache if 2FA token has been accepted, otherwise we need to be able to try again
      if (result != null && !result.requiresTwoFactor && !result.requiresCaptcha) {
        this.clearCache();
      }
      return result;
    } catch (e) {
      // API exceptions are okay, but if there are any unhandled client-side errors then clear cache to be safe
      if (!(e instanceof ErrorResponse)) {
        this.clearCache();
      }
      throw e;
    }
  }

  async makePreloginKey(masterPassword: string, email: string): Promise<MasterKey> {
    email = email.trim().toLowerCase();
    let kdf: KdfType = null;
    let kdfConfig: KdfConfig = null;
    try {
      const preloginResponse = await this.apiService.postPrelogin(new PreloginRequest(email));
      if (preloginResponse != null) {
        kdf = preloginResponse.kdf;
        kdfConfig = new KdfConfig(
          preloginResponse.kdfIterations,
          preloginResponse.kdfMemory,
          preloginResponse.kdfParallelism,
        );
      }
    } catch (e) {
      if (e == null || e.statusCode !== 404) {
        throw e;
      }
    }
    return await this.cryptoService.makeMasterKey(masterPassword, email, kdf, kdfConfig);
  }

  async sendAuthRequestPushNotification(notification: AuthRequestPushNotification): Promise<void> {
    await this.authRequestPushNotificationState.update((_) => notification.id);
  }

  async passwordlessLogin(
    id: string,
    key: string,
    requestApproved: boolean,
  ): Promise<AuthRequestResponse> {
    const pubKey = Utils.fromB64ToArray(key);

    const masterKey = await this.cryptoService.getMasterKey();
    let keyToEncrypt;
    let encryptedMasterKeyHash = null;

    if (masterKey) {
      keyToEncrypt = masterKey.encKey;

      // Only encrypt the master password hash if masterKey exists as
      // we won't have a masterKeyHash without a masterKey
      const masterKeyHash = await this.stateService.getKeyHash();
      if (masterKeyHash != null) {
        encryptedMasterKeyHash = await this.cryptoService.rsaEncrypt(
          Utils.fromUtf8ToArray(masterKeyHash),
          pubKey,
        );
      }
    } else {
      const userKey = await this.cryptoService.getUserKey();
      keyToEncrypt = userKey.key;
    }

    const encryptedKey = await this.cryptoService.rsaEncrypt(keyToEncrypt, pubKey);

    const request = new PasswordlessAuthRequest(
      encryptedKey.encryptedString,
      encryptedMasterKeyHash?.encryptedString,
      await this.appIdService.getAppId(),
      requestApproved,
    );
    return await this.apiService.putAuthRequest(id, request);
  }

  private async clearCache(): Promise<void> {
    await this.currentAuthTypeState.update((_) => null);
    await this.loginStrategyCacheState.update((_) => null);
    await this.clearSessionTimeout();
  }

  private async startSessionTimeout(): Promise<void> {
    await this.clearSessionTimeout();
    await this.loginStrategyCacheExpirationState.update(
      (_) => new Date(Date.now() + sessionTimeoutLength),
    );
    this.sessionTimeout = setTimeout(() => this.clearCache(), sessionTimeoutLength);
  }

  private async clearSessionTimeout(): Promise<void> {
    await this.loginStrategyCacheExpirationState.update((_) => null);
    this.sessionTimeout = null;
  }

  private async isSessionValid(): Promise<boolean> {
    const cache = await firstValueFrom(this.loginStrategyCacheState.state$);
    if (cache == null) {
      return false;
    }
    const expiration = await firstValueFrom(this.loginStrategyCacheExpirationState.state$);
    if (expiration != null && expiration < new Date()) {
      await this.clearCache();
      return false;
    }
    return true;
  }

  private initializeLoginStrategy(source: Observable<AuthenticationType | null>) {
    return source.pipe(
      map((strategy) => {
        if (strategy == null) {
          return null;
        }
        switch (strategy) {
          case AuthenticationType.Password:
            return new PasswordLoginStrategy(
              this.loginStrategyCacheState as GlobalState<PasswordLoginStrategyData>,
              this.cryptoService,
              this.apiService,
              this.tokenService,
              this.appIdService,
              this.platformUtilsService,
              this.messagingService,
              this.logService,
              this.stateService,
              this.twoFactorService,
              this.passwordStrengthService,
              this.policyService,
              this,
            );
          case AuthenticationType.Sso:
            return new SsoLoginStrategy(
              this.loginStrategyCacheState as GlobalState<SsoLoginStrategyData>,
              this.cryptoService,
              this.apiService,
              this.tokenService,
              this.appIdService,
              this.platformUtilsService,
              this.messagingService,
              this.logService,
              this.stateService,
              this.twoFactorService,
              this.keyConnectorService,
              this.deviceTrustCryptoService,
              this.authReqCryptoService,
              this.i18nService,
            );
          case AuthenticationType.UserApi:
            return new UserApiLoginStrategy(
              this.loginStrategyCacheState as GlobalState<UserApiLoginStrategyData>,
              this.cryptoService,
              this.apiService,
              this.tokenService,
              this.appIdService,
              this.platformUtilsService,
              this.messagingService,
              this.logService,
              this.stateService,
              this.twoFactorService,
              this.environmentService,
              this.keyConnectorService,
            );
          case AuthenticationType.AuthRequest:
            return new AuthRequestLoginStrategy(
              this.loginStrategyCacheState as GlobalState<AuthRequestLoginStrategyData>,
              this.cryptoService,
              this.apiService,
              this.tokenService,
              this.appIdService,
              this.platformUtilsService,
              this.messagingService,
              this.logService,
              this.stateService,
              this.twoFactorService,
              this.deviceTrustCryptoService,
            );
          case AuthenticationType.WebAuthn:
            return new WebAuthnLoginStrategy(
              this.loginStrategyCacheState as GlobalState<WebAuthnLoginStrategyData>,
              this.cryptoService,
              this.apiService,
              this.tokenService,
              this.appIdService,
              this.platformUtilsService,
              this.messagingService,
              this.logService,
              this.stateService,
              this.twoFactorService,
            );
        }
      }),
    );
  }
}
