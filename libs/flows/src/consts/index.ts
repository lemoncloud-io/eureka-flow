export * from './block-categories';
export * from './block-types';
export * from './status';

export const STORAGE_PREFIX = 'flow_mosaic_';
export const INDEX_KEY = 'flow_mosaic_index';
export const AUTO_SAVE_DELAY = 2000;

/** Thumbnail processing: 4:3 landscape aspect ratio */
export const THUMBNAIL_ASPECT_RATIO = '4:3';
/** Thumbnail processing: max width to keep file size ~400KB */
export const THUMBNAIL_MAX_WIDTH = '800';
