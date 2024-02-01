import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { TokenService } from "@bitwarden/common/auth/abstractions/token.service";
import { TwoFactorService } from "@bitwarden/common/auth/abstractions/two-factor.service";
import { AuthenticationType } from "@bitwarden/common/auth/enums/authentication-type";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { WebAuthnLoginTokenRequest } from "@bitwarden/common/auth/models/request/identity-token/webauthn-login-token.request";
import { IdentityTokenResponse } from "@bitwarden/common/auth/models/response/identity-token.response";
import { AppIdService } from "@bitwarden/common/platform/abstractions/app-id.service";
import { CryptoService } from "@bitwarden/common/platform/abstractions/crypto.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { GlobalState } from "@bitwarden/common/platform/state";
import { UserKey } from "@bitwarden/common/types/key";
import { firstValueFrom } from "rxjs";
import { Jsonify } from "type-fest";

import { WebAuthnLoginCredentials } from "../models/domain/login-credentials";

import { LoginStrategy, LoginStrategyData } from "./login.strategy";

export class WebAuthnLoginStrategyData implements LoginStrategyData {
  readonly type = AuthenticationType.WebAuthn;
  tokenRequest: WebAuthnLoginTokenRequest;
  captchaBypassToken?: string;
  credentials: WebAuthnLoginCredentials;

  static fromJSON(obj: Jsonify<WebAuthnLoginStrategyData>): WebAuthnLoginStrategyData {
    const data = Object.assign(new WebAuthnLoginStrategyData(), obj);
    Object.setPrototypeOf(data.tokenRequest, WebAuthnLoginTokenRequest.prototype);
    Object.setPrototypeOf(data.credentials, WebAuthnLoginCredentials.prototype);
    return data;
  }
}

export class WebAuthnLoginStrategy extends LoginStrategy {
  constructor(
    protected cache: GlobalState<WebAuthnLoginStrategyData>,
    cryptoService: CryptoService,
    apiService: ApiService,
    tokenService: TokenService,
    appIdService: AppIdService,
    platformUtilsService: PlatformUtilsService,
    messagingService: MessagingService,
    logService: LogService,
    stateService: StateService,
    twoFactorService: TwoFactorService,
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
  }

  async logIn(credentials: WebAuthnLoginCredentials) {
    const tokenRequest = new WebAuthnLoginTokenRequest(
      credentials.token,
      credentials.deviceResponse,
      await this.buildDeviceRequest(),
    );
    this.cache.update((data) => Object.assign(data, { tokenRequest, credentials }));

    const [authResult] = await this.startLogIn();
    return authResult;
  }

  async logInTwoFactor(): Promise<AuthResult> {
    throw new Error("2FA not supported yet for WebAuthn Login.");
  }

  protected override async setMasterKey() {
    return Promise.resolve();
  }

  protected override async setUserKey(idTokenResponse: IdentityTokenResponse) {
    const masterKeyEncryptedUserKey = idTokenResponse.key;

    if (masterKeyEncryptedUserKey) {
      // set the master key encrypted user key if it exists
      await this.cryptoService.setMasterKeyEncryptedUserKey(masterKeyEncryptedUserKey);
    }

    const userDecryptionOptions = idTokenResponse?.userDecryptionOptions;

    if (userDecryptionOptions?.webAuthnPrfOption) {
      const webAuthnPrfOption = idTokenResponse.userDecryptionOptions?.webAuthnPrfOption;

      const credentials = (await firstValueFrom(this.cache.state$)).credentials;
      // confirm we still have the prf key
      if (!credentials.prfKey) {
        return;
      }

      // decrypt prf encrypted private key
      const privateKey = await this.cryptoService.decryptToBytes(
        webAuthnPrfOption.encryptedPrivateKey,
        credentials.prfKey,
      );

      // decrypt user key with private key
      const userKey = await this.cryptoService.rsaDecrypt(
        webAuthnPrfOption.encryptedUserKey.encryptedString,
        privateKey,
      );

      if (userKey) {
        await this.cryptoService.setUserKey(new SymmetricCryptoKey(userKey) as UserKey);
      }
    }
  }

  protected override async setPrivateKey(response: IdentityTokenResponse): Promise<void> {
    await this.cryptoService.setPrivateKey(
      response.privateKey ?? (await this.createKeyPairForOldAccount()),
    );
  }
}
