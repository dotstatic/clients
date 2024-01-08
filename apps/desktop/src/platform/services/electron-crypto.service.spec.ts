import { FakeStateProvider } from "@bitwarden/common/../spec/fake-state-provider";
import { mock } from "jest-mock-extended";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { CryptoFunctionService } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import {
  SymmetricCryptoKey,
  UserKey,
} from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { USER_KEYS_KEY } from "@bitwarden/common/platform/services/crypto.service";
import { CsprngArray } from "@bitwarden/common/types/csprng";
import { UserId } from "@bitwarden/common/types/guid";

import { FakeGlobalState } from "../../../../../libs/common/spec/fake-state";

import { ElectronCryptoService } from "./electron-crypto.service";
import { ElectronStateService } from "./electron-state.service.abstraction";

describe("electronCryptoService", () => {
  let electronCryptoService: ElectronCryptoService;

  const cryptoFunctionService = mock<CryptoFunctionService>();
  const encryptService = mock<EncryptService>();
  const platformUtilService = mock<PlatformUtilsService>();
  const logService = mock<LogService>();
  const stateService = mock<ElectronStateService>();
  const accountService = mock<AccountService>();
  let stateProvider: FakeStateProvider;
  let userKeysState: FakeGlobalState<Record<UserId, UserKey>>;

  const mockUserId = "mock user id" as UserId;

  beforeEach(() => {
    stateProvider = new FakeStateProvider();
    userKeysState = stateProvider.global.mockFor(USER_KEYS_KEY);

    // initialize state
    userKeysState.stateSubject.next({});

    electronCryptoService = new ElectronCryptoService(
      cryptoFunctionService,
      encryptService,
      platformUtilService,
      logService,
      stateService,
      accountService,
      stateProvider,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("instantiates", () => {
    expect(electronCryptoService).not.toBeFalsy();
  });

  describe("setUserKey", () => {
    let mockUserKey: UserKey;

    beforeEach(() => {
      const mockRandomBytes = new Uint8Array(64) as CsprngArray;
      mockUserKey = new SymmetricCryptoKey(mockRandomBytes) as UserKey;
    });

    describe("Biometric Key refresh", () => {
      it("sets an Biometric key if getBiometricUnlock is true and the platform supports secure storage", async () => {
        stateService.getBiometricUnlock.mockResolvedValue(true);
        platformUtilService.supportsSecureStorage.mockReturnValue(true);
        stateService.getBiometricRequirePasswordOnStart.mockResolvedValue(false);

        await electronCryptoService.setUserKey(mockUserKey, mockUserId);

        expect(stateService.setUserKeyBiometric).toHaveBeenCalledWith(
          expect.objectContaining({ key: expect.any(String), clientEncKeyHalf: null }),
          {
            userId: mockUserId,
          },
        );
      });

      it("clears the Biometric key if getBiometricUnlock is false or the platform does not support secure storage", async () => {
        stateService.getBiometricUnlock.mockResolvedValue(true);
        platformUtilService.supportsSecureStorage.mockReturnValue(false);

        await electronCryptoService.setUserKey(mockUserKey, mockUserId);

        expect(stateService.setUserKeyBiometric).toHaveBeenCalledWith(null, {
          userId: mockUserId,
        });
      });

      it("clears the old deprecated Biometric key whenever a User Key is set", async () => {
        await electronCryptoService.setUserKey(mockUserKey, mockUserId);

        expect(stateService.setCryptoMasterKeyBiometric).toHaveBeenCalledWith(null, {
          userId: mockUserId,
        });
      });
    });
  });
});
