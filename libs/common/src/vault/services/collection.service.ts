import { firstValueFrom, Observable } from "rxjs";

import { CryptoService } from "../../platform/abstractions/crypto.service";
import { I18nService } from "../../platform/abstractions/i18n.service";
import { Utils } from "../../platform/misc/utils";
import {
  ActiveUserState,
  KeyDefinition,
  StateProvider,
  COLLECTION_DATA,
  DeriveDefinition,
  DerivedState,
} from "../../platform/state";
import { CollectionService as CollectionServiceAbstraction } from "../../vault/abstractions/collection.service";
import { CollectionData } from "../models/data/collection.data";
import { Collection } from "../models/domain/collection";
import { TreeNode } from "../models/domain/tree-node";
import { CollectionView } from "../models/view/collection.view";
import { ServiceUtils } from "../service-utils";

const ENCRYPTED_COLLECTION_DATA_KEY = new KeyDefinition<
  Record<string, { [id: string]: CollectionData }>
>(COLLECTION_DATA, "collections", {
  deserializer: (jsonData: any) => jsonData,
});

const DECRYPTED_COLLECTION_DATA_KEY = DeriveDefinition.from<
  Record<string, { [id: string]: CollectionData }>,
  CollectionView[],
  { collectionService: CollectionService }
>(ENCRYPTED_COLLECTION_DATA_KEY, {
  deserializer: (obj: any) => obj,
  derive: async (collections: any, { collectionService }) => {
    if (collections.encrypted) {
      const data: Collection[] = [];
      for (const id in collections.encrypted) {
        // eslint-disable-next-line
        if (collections.encrypted.hasOwnProperty(id)) {
          data.push(new Collection(collections.encrypted[id]));
        }
      }
      return await collectionService.decryptMany(data);
    } else {
      return [];
    }
  },
});

const NestingDelimiter = "/";

export class CollectionService implements CollectionServiceAbstraction {
  private encryptedCollectionDataState: ActiveUserState<
    Record<string, { [id: string]: CollectionData }>
  >;
  private encryptedCollectionDataState$: Observable<
    Record<string, { [id: string]: CollectionData }>
  >;
  private decryptedCollectionDataState: DerivedState<any>;
  private decryptedCollectionDataState$: Observable<Record<any, any>>;

  constructor(
    private cryptoService: CryptoService,
    private i18nService: I18nService,
    protected stateProvider: StateProvider,
  ) {
    this.encryptedCollectionDataState = this.stateProvider.getActive(ENCRYPTED_COLLECTION_DATA_KEY);
    this.encryptedCollectionDataState$ = this.encryptedCollectionDataState.state$;

    this.decryptedCollectionDataState = this.stateProvider.getDerived(
      this.encryptedCollectionDataState.state$,
      DECRYPTED_COLLECTION_DATA_KEY,
      { collectionService: this },
    );

    this.decryptedCollectionDataState$ = this.decryptedCollectionDataState.state$;
  }

  async clearCache(userId?: string): Promise<void> {
    await this.decryptedCollectionDataState.forceValue({ decrypted: null });
  }

  async encrypt(model: CollectionView): Promise<Collection> {
    if (model.organizationId == null) {
      throw new Error("Collection has no organization id.");
    }
    const key = await this.cryptoService.getOrgKey(model.organizationId);
    if (key == null) {
      throw new Error("No key for this collection's organization.");
    }
    const collection = new Collection();
    collection.id = model.id;
    collection.organizationId = model.organizationId;
    collection.readOnly = model.readOnly;
    collection.name = await this.cryptoService.encrypt(model.name, key);
    return collection;
  }

  async decryptMany(collections: Collection[]): Promise<CollectionView[]> {
    if (collections == null) {
      return [];
    }
    const decCollections: CollectionView[] = [];
    const promises: Promise<any>[] = [];
    collections.forEach((collection) => {
      promises.push(collection.decrypt().then((c) => decCollections.push(c)));
    });
    await Promise.all(promises);
    return decCollections.sort(Utils.getSortFunction(this.i18nService, "name"));
  }

  async get(id: string): Promise<Collection> {
    const collections = (await firstValueFrom(this.encryptedCollectionDataState$)).encrypted;
    // eslint-disable-next-line
    if (collections == null || !collections.hasOwnProperty(id)) {
      return null;
    }

    return new Collection(collections[id]);
  }

  async getAll(): Promise<Collection[]> {
    const collections = (await firstValueFrom(this.encryptedCollectionDataState$)).encrypted;

    const response: Collection[] = [];
    for (const id in collections) {
      // eslint-disable-next-line
      if (collections.hasOwnProperty(id)) {
        response.push(new Collection(collections[id]));
      }
    }
    return response;
  }

  async getAllDecrypted(): Promise<CollectionView[]> {
    let decryptedCollections = (await firstValueFrom(this.decryptedCollectionDataState$)).decrypted;
    if (decryptedCollections != null) {
      return decryptedCollections;
    }

    const hasKey = await this.cryptoService.hasUserKey();
    if (!hasKey) {
      throw new Error("No key.");
    }

    const collections = await this.getAll();
    decryptedCollections = await this.decryptMany(collections);

    await this.decryptedCollectionDataState.forceValue({ decrypted: [...decryptedCollections] });
    return decryptedCollections;
  }

  async getAllNested(collections: CollectionView[] = null): Promise<TreeNode<CollectionView>[]> {
    if (collections == null) {
      collections = await this.getAllDecrypted();
    }
    const nodes: TreeNode<CollectionView>[] = [];
    collections.forEach((c) => {
      const collectionCopy = new CollectionView();
      collectionCopy.id = c.id;
      collectionCopy.organizationId = c.organizationId;
      const parts = c.name != null ? c.name.replace(/^\/+|\/+$/g, "").split(NestingDelimiter) : [];
      ServiceUtils.nestedTraverse(nodes, 0, parts, collectionCopy, null, NestingDelimiter);
    });
    return nodes;
  }

  /**
   * @deprecated August 30 2022: Moved to new Vault Filter Service
   * Remove when Desktop and Browser are updated
   */
  async getNested(id: string): Promise<TreeNode<CollectionView>> {
    const collections = await this.getAllNested();
    return ServiceUtils.getTreeNodeObjectFromList(collections, id) as TreeNode<CollectionView>;
  }

  async upsert(collection: CollectionData | CollectionData[]): Promise<any> {
    let collections = (await firstValueFrom(this.encryptedCollectionDataState$)).encrypted;
    if (collections == null) {
      collections = {};
    }

    if (collection instanceof CollectionData) {
      const c = collection as CollectionData;
      collections[c.id] = c;
    } else {
      (collection as CollectionData[]).forEach((c) => {
        collections[c.id] = c;
      });
    }

    await this.replace(collections);
  }

  async replace(collections: { [id: string]: CollectionData }): Promise<any> {
    await this.clearCache();
    await this.encryptedCollectionDataState.update(() => {
      return { encrypted: { ...collections } };
    });
  }

  async clear(userId?: string): Promise<any> {
    await this.clearCache(userId);
    await this.encryptedCollectionDataState.update(() => {
      return { encrypted: null };
    });
  }

  async delete(id: string | string[]): Promise<any> {
    const collections = (await firstValueFrom(this.encryptedCollectionDataState$)).encrypted;
    if (collections == null) {
      return;
    }

    if (typeof id === "string") {
      delete collections[id];
    } else {
      (id as string[]).forEach((i) => {
        delete collections[i];
      });
    }

    await this.replace(collections);
  }
}
