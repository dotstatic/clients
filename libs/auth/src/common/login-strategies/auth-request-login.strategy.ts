import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { DeviceTrustCryptoServiceAbstraction } from "@bitwarden/common/auth/abstractions/device-trust-crypto.service.abstraction";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { TwoFactorService } from "@bitwarden/common/auth/abstractions/two-factor.service";
import { AuthenticationType } from "@bitwarden/common/auth/enums/authentication-type";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { PasswordTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/password-token.request";
import { TokenTwoFactorRequest } from "@bitwarden/common/auth/models/request/identity-token/token-two-factor.request";
import { IdentityTokenResponse } from "@bitwarden/common/auth/models/response/identity-token.response";
import { AppIdService } from "@bitwarden/common/platform/abstractions/app-id.service";
import { CryptoService } from "@bitwarden/common/platform/abstractions/crypto.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { GlobalState } from "@bitwarden/common/platform/state";
import { Observable, map, firstValueFrom } from "rxjs";
import { Jsonify } from "type-fest";

import { AuthRequestLoginCredentials } from "../models/domain/login-credentials";

import { LoginStrategy, LoginStrategyData } from "./login.strategy";

export class AuthRequestLoginStrategyData implements LoginStrategyData {
  readonly type = AuthenticationType.AuthRequest;
  tokenRequest: PasswordTokenRequest;
  captchaBypassToken: string;
  authRequestCredentials: AuthRequestLoginCredentials;

  static fromJSON(obj: Jsonify<AuthRequestLoginStrategyData>): AuthRequestLoginStrategyData {
    const data = Object.assign(new AuthRequestLoginStrategyData(), obj);
    Object.setPrototypeOf(data.tokenRequest, PasswordTokenRequest.prototype);
    Object.setPrototypeOf(data.authRequestCredentials, AuthRequestLoginCredentials.prototype);
    return data;
  }
}

export class AuthRequestLoginStrategy extends LoginStrategy {
  email$: Observable<string>;
  accessCode$: Observable<string>;
  authRequestId$: Observable<string>;

  constructor(
    protected cache: GlobalState<AuthRequestLoginStrategyData>,
    cryptoService: CryptoService,
    apiService: ApiService,
    tokenService: TokenService,
    appIdService: AppIdService,
    platformUtilsService: PlatformUtilsService,
    messagingService: MessagingService,
    logService: LogService,
    stateService: StateService,
    twoFactorService: TwoFactorService,
    private deviceTrustCryptoService: DeviceTrustCryptoServiceAbstraction,
  ) {
    super(
      cryptoService,
      apiService,
      tokenService,
      appIdService,
      platformUtilsService,
      messagingService,
      logService,
      stateService,
      twoFactorService,
    );

    this.email$ = this.cache.state$.pipe(map((data) => data.tokenRequest.email));
    this.accessCode$ = this.cache.state$.pipe(
      map((data) => data.authRequestCredentials.accessCode),
    );
    this.authRequestId$ = this.cache.state$.pipe(
      map((data) => data.authRequestCredentials.authRequestId),
    );
  }

  override async logIn(credentials: AuthRequestLoginCredentials) {
    const tokenRequest = new PasswordTokenRequest(
      credentials.email,
      credentials.accessCode,
      null,
      await this.buildTwoFactor(credentials.twoFactor),
      await this.buildDeviceRequest(),
    );
    tokenRequest.setAuthRequestAccessCode(credentials.authRequestId);
    await this.cache.update((data) =>
      Object.assign(data, { tokenRequest, authRequestCredentials: credentials }),
    );

    const [authResult] = await this.startLogIn();
    return authResult;
  }

  override async logInTwoFactor(
    twoFactor: TokenTwoFactorRequest,
    captchaResponse: string,
  ): Promise<AuthResult> {
    await this.cache.update((data) =>
      Object.assign(data, {
        tokenRequest: { captchaResponse: captchaResponse ?? data.captchaBypassToken },
      }),
    );
    return super.logInTwoFactor(twoFactor);
  }

  protected override async setMasterKey(response: IdentityTokenResponse) {
    const authRequestCredentials = (await firstValueFrom(this.cache.state$)).authRequestCredentials;
    if (
      authRequestCredentials.decryptedMasterKey &&
      authRequestCredentials.decryptedMasterKeyHash
    ) {
      await this.cryptoService.setMasterKey(authRequestCredentials.decryptedMasterKey);
      await this.cryptoService.setMasterKeyHash(authRequestCredentials.decryptedMasterKeyHash);
    }
  }

  protected override async setUserKey(response: IdentityTokenResponse): Promise<void> {
    const authRequestCredentials = (await firstValueFrom(this.cache.state$)).authRequestCredentials;
    // User now may or may not have a master password
    // but set the master key encrypted user key if it exists regardless
    await this.cryptoService.setMasterKeyEncryptedUserKey(response.key);

    if (authRequestCredentials.decryptedUserKey) {
      await this.cryptoService.setUserKey(authRequestCredentials.decryptedUserKey);
    } else {
      await this.trySetUserKeyWithMasterKey();
      // Establish trust if required after setting user key
      await this.deviceTrustCryptoService.trustDeviceIfRequired();
    }
  }

  private async trySetUserKeyWithMasterKey(): Promise<void> {
    const masterKey = await this.cryptoService.getMasterKey();
    if (masterKey) {
      const userKey = await this.cryptoService.decryptUserKeyWithMasterKey(masterKey);
      await this.cryptoService.setUserKey(userKey);
    }
  }

  protected override async setPrivateKey(response: IdentityTokenResponse): Promise<void> {
    await this.cryptoService.setPrivateKey(
      response.privateKey ?? (await this.createKeyPairForOldAccount()),
    );
  }
}
