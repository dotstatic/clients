import { Observable, map } from "rxjs";

import {
  AutofillOverlayVisibility,
  InlineMenuVisibilitySetting,
} from "../../../../../apps/browser/src/autofill/utils/autofill-overlay.enum";
import {
  AUTOFILL_SETTINGS_DISK,
  AUTOFILL_SETTINGS_DISK_LOCAL,
  ActiveUserState,
  GlobalState,
  KeyDefinition,
  StateProvider,
} from "../../platform/state";

const AUTOFILL_ON_PAGE_LOAD = new KeyDefinition(AUTOFILL_SETTINGS_DISK, "autoFillOnPageLoad", {
  deserializer: (value: boolean) => value ?? false,
});

const AUTOFILL_ON_PAGE_LOAD_DEFAULT = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK,
  "autofillOnPageLoadDefault",
  {
    deserializer: (value: boolean) => value ?? false,
  },
);

const AUTO_COPY_TOTP = new KeyDefinition(AUTOFILL_SETTINGS_DISK, "autoCopyTotp", {
  deserializer: (value: boolean) => value ?? false,
});

const AUTOFILL_ON_PAGE_LOAD_CALLOUT_DISMISSED = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK,
  "autofillOnPageLoadCalloutIsDismissed",
  {
    deserializer: (value: boolean) => value ?? false,
  },
);

const ACTIVATE_AUTOFILL_ON_PAGE_LOAD_FROM_POLICY = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK_LOCAL,
  "activateAutofillOnPageLoadFromPolicy",
  {
    deserializer: (value: boolean) => value ?? false,
  },
);

const INLINE_MENU_VISIBILITY = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK_LOCAL,
  "inlineMenuVisibility",
  {
    deserializer: (value: InlineMenuVisibilitySetting) => value ?? AutofillOverlayVisibility.Off,
  },
);

export abstract class AutofillSettingsServiceAbstraction {
  autofillOnPageLoad$: Observable<boolean>;
  setAutofillOnPageLoad: (newValue: boolean) => Promise<void>;
  autofillOnPageLoadDefault$: Observable<boolean>;
  setAutofillOnPageLoadDefault: (newValue: boolean) => Promise<void>;
  autoCopyTotp$: Observable<boolean>;
  setAutoCopyTotp: (newValue: boolean) => Promise<void>;
  autofillOnPageLoadCalloutIsDismissed$: Observable<boolean>;
  setAutofillOnPageLoadCalloutIsDismissed: (newValue: boolean) => Promise<void>;
  activateAutofillOnPageLoadFromPolicy$: Observable<boolean>;
  setActivateAutofillOnPageLoadFromPolicy: (newValue: boolean) => Promise<void>;
  inlineMenuVisibility$: Observable<InlineMenuVisibilitySetting>;
  setInlineMenuVisibility: (newValue: InlineMenuVisibilitySetting) => Promise<void>;
}

export class AutofillSettingsService implements AutofillSettingsServiceAbstraction {
  private autofillOnPageLoadState: ActiveUserState<boolean>;
  readonly autofillOnPageLoad$: Observable<boolean>;

  private autofillOnPageLoadDefaultState: ActiveUserState<boolean>;
  readonly autofillOnPageLoadDefault$: Observable<boolean>;

  private autoCopyTotpState: ActiveUserState<boolean>;
  readonly autoCopyTotp$: Observable<boolean>;

  private autofillOnPageLoadCalloutIsDismissedState: ActiveUserState<boolean>;
  readonly autofillOnPageLoadCalloutIsDismissed$: Observable<boolean>;

  private activateAutofillOnPageLoadFromPolicyState: ActiveUserState<boolean>;
  readonly activateAutofillOnPageLoadFromPolicy$: Observable<boolean>;

  private inlineMenuVisibilityState: GlobalState<InlineMenuVisibilitySetting>;
  readonly inlineMenuVisibility$: Observable<InlineMenuVisibilitySetting>;

  constructor(private stateProvider: StateProvider) {
    this.autofillOnPageLoadState = this.stateProvider.getActive(AUTOFILL_ON_PAGE_LOAD);
    this.autofillOnPageLoad$ = this.autofillOnPageLoadState.state$.pipe(map((x) => x ?? false));

    this.autofillOnPageLoadDefaultState = this.stateProvider.getActive(
      AUTOFILL_ON_PAGE_LOAD_DEFAULT,
    );
    this.autofillOnPageLoadDefault$ = this.autofillOnPageLoadDefaultState.state$.pipe(
      map((x) => x ?? true),
    );

    this.autoCopyTotpState = this.stateProvider.getActive(AUTO_COPY_TOTP);
    this.autoCopyTotp$ = this.autoCopyTotpState.state$.pipe(map((x) => x ?? false));

    this.autofillOnPageLoadCalloutIsDismissedState = this.stateProvider.getActive(
      AUTOFILL_ON_PAGE_LOAD_CALLOUT_DISMISSED,
    );
    this.autofillOnPageLoadCalloutIsDismissed$ =
      this.autofillOnPageLoadCalloutIsDismissedState.state$.pipe(map((x) => x ?? false));

    this.activateAutofillOnPageLoadFromPolicyState = this.stateProvider.getActive(
      ACTIVATE_AUTOFILL_ON_PAGE_LOAD_FROM_POLICY,
    );
    this.activateAutofillOnPageLoadFromPolicy$ =
      this.activateAutofillOnPageLoadFromPolicyState.state$.pipe(map((x) => x ?? false));

    this.inlineMenuVisibilityState = this.stateProvider.getGlobal(INLINE_MENU_VISIBILITY);
    this.inlineMenuVisibility$ = this.inlineMenuVisibilityState.state$.pipe(
      map((x) => x ?? AutofillOverlayVisibility.Off),
    );
  }

  async setAutofillOnPageLoad(newValue: boolean): Promise<void> {
    await this.autofillOnPageLoadState.update(() => newValue);
  }

  async setAutofillOnPageLoadDefault(newValue: boolean): Promise<void> {
    await this.autofillOnPageLoadDefaultState.update(() => newValue);
  }

  async setAutoCopyTotp(newValue: boolean): Promise<void> {
    await this.autoCopyTotpState.update(() => newValue);
  }

  async setAutofillOnPageLoadCalloutIsDismissed(newValue: boolean): Promise<void> {
    await this.autofillOnPageLoadCalloutIsDismissedState.update(() => newValue);
  }

  async setActivateAutofillOnPageLoadFromPolicy(newValue: boolean): Promise<void> {
    await this.activateAutofillOnPageLoadFromPolicyState.update(() => newValue);
  }

  async setInlineMenuVisibility(newValue: InlineMenuVisibilitySetting): Promise<void> {
    await this.inlineMenuVisibilityState.update(() => newValue);
  }
}
