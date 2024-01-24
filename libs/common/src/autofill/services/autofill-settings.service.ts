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

export abstract class AutofillSettingsServiceAbstraction {
  autofillOnLoad$: Observable<boolean>;
  setAutofillOnPageLoad: (newValue: boolean) => Promise<void>;
}

export class AutofillSettingsService implements AutofillSettingsServiceAbstraction {
  private autofillOnLoadState: ActiveUserState<boolean>;
  readonly autofillOnLoad$: Observable<boolean>;

  constructor(private stateProvider: StateProvider) {
    this.autofillOnLoadState = this.stateProvider.getActive(AUTOFILL_ON_PAGE_LOAD);
    this.autofillOnLoad$ = this.autofillOnLoadState.state$.pipe(map((x) => x ?? false));
  }

  async setAutofillOnPageLoad(newValue: boolean): Promise<void> {
    await this.autofillOnLoadState.update(() => newValue);
  }
}
