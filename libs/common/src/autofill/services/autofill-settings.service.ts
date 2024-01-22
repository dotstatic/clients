import { Observable, map } from "rxjs";

import { LogService } from "../../platform/abstractions/log.service";
import {
  AUTOFILL_SETTINGS_DISK,
  ActiveUserState,
  StateProvider,
  KeyDefinition,
} from "../../platform/state";

const AUTOFILL_ON_PAGE_LOAD = new KeyDefinition(AUTOFILL_SETTINGS_DISK, "autoFillOnPageLoad", {
  deserializer: (value: boolean) => value ?? false,
});

export abstract class AutofillSettingsServiceAbstraction {}

export class AutofillSettingsService {
  private autofillOnLoadState: ActiveUserState<boolean>;

  readonly autofillOnLoad$: Observable<boolean>;

  constructor(
    private logService: LogService,
    private stateProvider: StateProvider,
  ) {
    this.autofillOnLoadState = this.stateProvider.getActive(AUTOFILL_ON_PAGE_LOAD);
    this.autofillOnLoad$ = this.autofillOnLoadState.state$.pipe(map((x) => x ?? false));
  }

  async setAutofillOnPageLoad(newValue: boolean): Promise<void> {
    await this.autofillOnLoadState.update(() => newValue);
  }
}
