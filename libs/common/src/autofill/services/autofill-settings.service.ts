import { Observable, map } from "rxjs";

import {
  AUTOFILL_SETTINGS_DISK,
  ActiveUserState,
  KeyDefinition,
  StateProvider,
} from "../../platform/state";

const AUTOFILL_ON_PAGE_LOAD = new KeyDefinition(AUTOFILL_SETTINGS_DISK, "autoFillOnPageLoad", {
  deserializer: (value: boolean) => value ?? false,
});

const AUTOFILL_ON_PAGE_LOAD_DEFAULT = new KeyDefinition(
  AUTOFILL_SETTINGS_DISK,
  "autoFillOnPageLoadDefault",
  {
    deserializer: (value: boolean) => value ?? false,
  },
);

export abstract class AutofillSettingsServiceAbstraction {
  autofillOnLoad$: Observable<boolean>;
  setAutofillOnPageLoad: (newValue: boolean) => Promise<void>;
  autofillOnLoadDefault$: Observable<boolean>;
  setAutofillOnPageLoadDefault: (newValue: boolean) => Promise<void>;
}

export class AutofillSettingsService implements AutofillSettingsServiceAbstraction {
  private autofillOnLoadState: ActiveUserState<boolean>;
  readonly autofillOnLoad$: Observable<boolean>;
  private autofillOnLoadDefaultState: ActiveUserState<boolean>;
  readonly autofillOnLoadDefault$: Observable<boolean>;

  constructor(private stateProvider: StateProvider) {
    this.autofillOnLoadState = this.stateProvider.getActive(AUTOFILL_ON_PAGE_LOAD);
    this.autofillOnLoad$ = this.autofillOnLoadState.state$.pipe(map((x) => x ?? false));

    this.autofillOnLoadDefaultState = this.stateProvider.getActive(AUTOFILL_ON_PAGE_LOAD_DEFAULT);
    this.autofillOnLoadDefault$ = this.autofillOnLoadDefaultState.state$.pipe(
      map((x) => x ?? true),
    );
  }

  async setAutofillOnPageLoad(newValue: boolean): Promise<void> {
    await this.autofillOnLoadState.update(() => newValue);
  }

  async setAutofillOnPageLoadDefault(newValue: boolean): Promise<void> {
    await this.autofillOnLoadDefaultState.update(() => newValue);
  }
}
