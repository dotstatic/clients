import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { CryptoFunctionService } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { StateService } from "@bitwarden/common/platform/abstractions/state.service";
import { BiometricStateService } from "@bitwarden/common/platform/biometrics/biometric-state.service";
import { KeySuffixOptions } from "@bitwarden/common/platform/enums";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { EncString } from "@bitwarden/common/platform/models/domain/enc-string";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { CryptoService } from "@bitwarden/common/platform/services/crypto.service";
import { StateProvider } from "@bitwarden/common/platform/state";
import { CsprngString } from "@bitwarden/common/types/csprng";
import { UserId } from "@bitwarden/common/types/guid";
import { UserKey, MasterKey } from "@bitwarden/common/types/key";

export abstract class ElectronCryptoService extends CryptoService {
  /**
   * Creates and sets a new biometric client key half for the currently active user.
   */
  abstract setBiometricClientKeyHalf(): Promise<void>;
  /**
   * Removes the biometric client key half for the currently active user.
   */
  abstract removeBiometricClientKeyHalf(): Promise<void>;
}

export class DefaultElectronCryptoService extends ElectronCryptoService {
  constructor(
    cryptoFunctionService: CryptoFunctionService,
    encryptService: EncryptService,
    platformUtilsService: PlatformUtilsService,
    logService: LogService,
    stateService: StateService,
    accountService: AccountService,
    stateProvider: StateProvider,
    private biometricStateService: BiometricStateService,
  ) {
    super(
      cryptoFunctionService,
      encryptService,
      platformUtilsService,
      logService,
      stateService,
      accountService,
      stateProvider,
    );
  }

  override async hasUserKeyStored(keySuffix: KeySuffixOptions, userId?: UserId): Promise<boolean> {
    if (keySuffix === KeySuffixOptions.Biometric) {
      // TODO: Remove after 2023.10 release (https://bitwarden.atlassian.net/browse/PM-3474)
      const oldKey = await this.stateService.hasCryptoMasterKeyBiometric({ userId: userId });
      return oldKey || (await this.stateService.hasUserKeyBiometric({ userId: userId }));
    }
    return super.hasUserKeyStored(keySuffix, userId);
  }

  override async clearStoredUserKey(keySuffix: KeySuffixOptions, userId?: UserId): Promise<void> {
    if (keySuffix === KeySuffixOptions.Biometric) {
      await this.stateService.setUserKeyBiometric(null, { userId: userId });
      await this.biometricStateService.removeEncryptedClientKeyHalf(userId);
      await this.clearDeprecatedKeys(KeySuffixOptions.Biometric, userId);
      return;
    }
    super.clearStoredUserKey(keySuffix, userId);
  }

  async setBiometricClientKeyHalf(): Promise<void> {
    const userKey = await this.getUserKeyWithLegacySupport();
    const keyBytes = await this.cryptoFunctionService.randomBytes(32);
    const biometricKey = Utils.fromBufferToUtf8(keyBytes) as CsprngString;
    const encKey = await this.encryptService.encrypt(biometricKey, userKey);

    await this.biometricStateService.setEncryptedClientKeyHalf(encKey);
  }

  async removeBiometricClientKeyHalf(): Promise<void> {
    await this.biometricStateService.setEncryptedClientKeyHalf(null);
  }

  protected override async storeAdditionalKeys(key: UserKey, userId?: UserId) {
    await super.storeAdditionalKeys(key, userId);

    const storeBiometricKey = await this.shouldStoreKey(KeySuffixOptions.Biometric, userId);

    if (storeBiometricKey) {
      await this.storeBiometricKey(key, userId);
    } else {
      await this.stateService.setUserKeyBiometric(null, { userId: userId });
    }
    await this.clearDeprecatedKeys(KeySuffixOptions.Biometric, userId);
  }

  protected override async getKeyFromStorage(
    keySuffix: KeySuffixOptions,
    userId?: UserId,
  ): Promise<UserKey> {
    if (keySuffix === KeySuffixOptions.Biometric) {
      await this.migrateBiometricKeyIfNeeded(userId);
      const userKey = await this.stateService.getUserKeyBiometric({ userId: userId });
      return new SymmetricCryptoKey(Utils.fromB64ToArray(userKey)) as UserKey;
    }
    return await super.getKeyFromStorage(keySuffix, userId);
  }

  protected async storeBiometricKey(key: UserKey, userId?: UserId): Promise<void> {
    // May resolve to null, in which case no client key have is required
    const clientEncKeyHalf = await this.getBiometricEncryptionClientKeyHalf(userId);
    await this.stateService.setUserKeyBiometric(
      { key: key.keyB64, clientEncKeyHalf },
      { userId: userId },
    );
  }

  protected async shouldStoreKey(keySuffix: KeySuffixOptions, userId?: UserId): Promise<boolean> {
    if (keySuffix === KeySuffixOptions.Biometric) {
      const biometricUnlock = await this.stateService.getBiometricUnlock({ userId: userId });
      return biometricUnlock && this.platformUtilService.supportsSecureStorage();
    }
    return await super.shouldStoreKey(keySuffix, userId);
  }

  protected override async clearAllStoredUserKeys(userId?: UserId): Promise<void> {
    await this.clearStoredUserKey(KeySuffixOptions.Biometric, userId);
    super.clearAllStoredUserKeys(userId);
  }

  private async getBiometricEncryptionClientKeyHalf(userId?: UserId): Promise<CsprngString | null> {
    const encryptedKeyHalfPromise =
      userId == null
        ? firstValueFrom(this.biometricStateService.encryptedClientKeyHalf$)
        : this.biometricStateService.getEncryptedClientKeyHalf(userId);
    const encryptedKeyHalf = await encryptedKeyHalfPromise;
    if (encryptedKeyHalf == null) {
      return null;
    }
    const userKey = await this.getUserKeyWithLegacySupport();
    return (await this.encryptService.decryptToUtf8(encryptedKeyHalf, userKey)) as CsprngString;
  }

  // --LEGACY METHODS--
  // We previously used the master key for additional keys, but now we use the user key.
  // These methods support migrating the old keys to the new ones.
  // TODO: Remove after 2023.10 release (https://bitwarden.atlassian.net/browse/PM-3475)

  override async clearDeprecatedKeys(keySuffix: KeySuffixOptions, userId?: UserId) {
    if (keySuffix === KeySuffixOptions.Biometric) {
      await this.stateService.setCryptoMasterKeyBiometric(null, { userId: userId });
    }

    super.clearDeprecatedKeys(keySuffix, userId);
  }

  private async migrateBiometricKeyIfNeeded(userId?: UserId) {
    if (await this.stateService.hasCryptoMasterKeyBiometric({ userId })) {
      const oldBiometricKey = await this.stateService.getCryptoMasterKeyBiometric({ userId });
      // decrypt
      const masterKey = new SymmetricCryptoKey(Utils.fromB64ToArray(oldBiometricKey)) as MasterKey;
      let encUserKey = await this.stateService.getEncryptedCryptoSymmetricKey();
      encUserKey = encUserKey ?? (await this.stateService.getMasterKeyEncryptedUserKey());
      if (!encUserKey) {
        throw new Error("No user key found during biometric migration");
      }
      const userKey = await this.decryptUserKeyWithMasterKey(masterKey, new EncString(encUserKey));
      // migrate
      await this.storeBiometricKey(userKey, userId);
      await this.stateService.setCryptoMasterKeyBiometric(null, { userId });
    }
  }
}
