import { FONT_CATALOG, type FontCatalogEntry } from './font-catalog';
import { registerFontCatalog } from './font-loader';

let cachedGoogleFontCatalog: readonly FontCatalogEntry[] | null = null;

export async function getGoogleFontsCatalog(): Promise<readonly FontCatalogEntry[]> {
  if (cachedGoogleFontCatalog) {
    return cachedGoogleFontCatalog;
  }

  const catalog = [...FONT_CATALOG];
  registerFontCatalog(catalog);
  cachedGoogleFontCatalog = catalog;
  return catalog;
}
