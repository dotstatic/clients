import { EncryptedString } from "../models/domain/enc-string";
import { KeyDefinition, BIOMETRIC_SETTINGS_DISK } from "../state";

/**
 * If the user has elected to require a password on first unlock of an application instance, this key will store the
 * encrypted client key half used to unlock the vault.
 *
 * For operating systems without application-level key storage, this key half is concatenated with a signature
 * provided by the OS and used to encrypt the biometric key prior to storage.
 */
export const ENCRYPTED_CLIENT_KEY_HALF = new KeyDefinition<EncryptedString>(
  BIOMETRIC_SETTINGS_DISK,
  "clientKeyHalf",
  {
    deserializer: (obj) => obj,
  },
);

/**
 * Indicates the user has been warned about the security implications of using biometrics and, depending on the OS,
 * recommended to require a password on first unlock of an application instance.
 */
export const DISMISSED_REQUIRE_PASSWORD_ON_START_CALLOUT = new KeyDefinition<boolean>(
  BIOMETRIC_SETTINGS_DISK,
  "dismissedBiometricRequirePasswordOnStartCallout",
  {
    deserializer: (obj) => obj,
  },
);

/**
 * Stores whether the user has elected to cancel the biometric prompt. This is stored on disk due to process-reload
 * wiping memory state. We don't want to prompt the user again if they've elected to cancel.
 */
export const PROMPT_CANCELLED = new KeyDefinition<boolean>(
  BIOMETRIC_SETTINGS_DISK,
  "promptCancelled",
  {
    deserializer: (obj) => obj,
  },
);

/**
 * Stores whether the user has elected to automatically prompt for biometric unlock on application start.
 */
export const PROMPT_AUTOMATICALLY = new KeyDefinition<boolean>(
  BIOMETRIC_SETTINGS_DISK,
  "promptAutomatically",
  {
    deserializer: (obj) => obj,
  },
);
