import {
  AdventureImportUnsupportedError,
  EmbeddedItemCreationFailedError,
  ImportCreationFailedError,
  PackNotFoundError,
  PackTypeMismatchError,
  WorldActorNotFoundError
} from '@/compendiums/domain';
import type {
  ActorInventory,
  CreatedActorView,
  CreatedItemView,
  PackCatalog,
  PackDescriptor,
  PackDocumentReader,
  WorldImporter
} from '@/compendiums/domain';
import type {
  AddItemToActorCommand,
  ImportActorCommand,
  ImportDocumentCommand,
  ImportItemCommand
} from './queries';
import type { AddItemToActorResult, ImportDocumentResult } from './results';

export interface CompendiumImportServiceDependencies {
  readonly catalog: PackCatalog;
  readonly documentReader: PackDocumentReader;
  readonly worldImporter: WorldImporter;
  readonly actorInventory: ActorInventory;
}

/**
 * Turn a pack document's source into world data the way Foundry's fromCompendium does: a new id,
 * no pack folder, sort or ownership, and _stats.compendiumSource pointing back at the pack entry.
 */
function prepareImport(
  data: Record<string, unknown>,
  pack: PackDescriptor,
  documentId: string,
  options: { name?: string | undefined; folder?: string | undefined }
): Record<string, unknown> {
  delete data['_id'];
  delete data['folder'];
  delete data['sort'];
  delete data['ownership'];
  if (options.name !== undefined) data['name'] = options.name;
  if (options.folder !== undefined) data['folder'] = options.folder;
  const stats = (data['_stats'] as Record<string, unknown> | undefined) ?? {};
  data['_stats'] = { ...stats, compendiumSource: `Compendium.${pack.id}.${pack.type}.${documentId}`, duplicateSource: null };
  return data;
}

export class CompendiumImportService {
  constructor(private readonly deps: CompendiumImportServiceDependencies) {}

  async importDocument(command: ImportDocumentCommand): Promise<ImportDocumentResult> {
    const pack = this.requirePack(command.packId);

    if (pack.type === 'Adventure') {
      throw new AdventureImportUnsupportedError(command.packId);
    }

    const data = prepareImport(
      await this.deps.documentReader.readDocumentSource(command.packId, command.documentId),
      pack,
      command.documentId,
      command
    );

    const created = await this.deps.worldImporter.createByDocumentType(pack.type, data);
    if (!created) {
      throw new ImportCreationFailedError(command.documentId);
    }

    return {
      worldId: created.id,
      uuid: created.uuid,
      name: created.name,
      documentType: pack.type
    };
  }

  async importActor(command: ImportActorCommand): Promise<CreatedActorView> {
    const pack = this.requirePack(command.packId);
    if (pack.type !== 'Actor') {
      throw new PackTypeMismatchError(command.packId, 'Actor', pack.type);
    }

    const data = prepareImport(
      await this.deps.documentReader.readDocumentSource(command.packId, command.actorId),
      pack,
      command.actorId,
      command
    );

    const created = await this.deps.worldImporter.createActor(data);
    if (!created) {
      throw new ImportCreationFailedError(command.actorId);
    }
    return created;
  }

  async importItem(command: ImportItemCommand): Promise<CreatedItemView> {
    const pack = this.requirePack(command.packId);
    if (pack.type !== 'Item') {
      throw new PackTypeMismatchError(command.packId, 'Item', pack.type);
    }

    const data = prepareImport(
      await this.deps.documentReader.readDocumentSource(command.packId, command.itemId),
      pack,
      command.itemId,
      command
    );

    const created = await this.deps.worldImporter.createItem(data);
    if (!created) {
      throw new ImportCreationFailedError(command.itemId);
    }
    return created;
  }

  async addItemToActor(command: AddItemToActorCommand): Promise<AddItemToActorResult> {
    const actor = this.deps.actorInventory.findActor(command.actorId);
    if (actor === null) {
      throw new WorldActorNotFoundError(command.actorId);
    }

    const pack = this.requirePack(command.packId);
    if (pack.type !== 'Item') {
      throw new PackTypeMismatchError(command.packId, 'Item', pack.type);
    }

    const data = prepareImport(
      await this.deps.documentReader.readDocumentSource(command.packId, command.itemId),
      pack,
      command.itemId,
      { name: command.name }
    );
    if (command.quantity !== undefined) {
      const existingSystem = data['system'];
      const system = (existingSystem as Record<string, unknown> | undefined) ?? {};
      system['quantity'] = command.quantity;
      data['system'] = system;
    }

    const created = await this.deps.actorInventory.createEmbeddedItem(
      command.actorId,
      data
    );
    if (!created) {
      throw new EmbeddedItemCreationFailedError();
    }

    return { item: created, actor };
  }

  private requirePack(packId: string): PackDescriptor {
    const pack = this.deps.catalog.findPack(packId);
    if (pack === null) {
      throw new PackNotFoundError(packId);
    }
    return pack;
  }
}
