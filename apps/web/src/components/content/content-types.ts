export interface ContentTextNode {
  text: string;
  type: 'text';
  marks?: Array<{ type: string; attrs?: Record<string, string | number | boolean> }>;
}

export interface ContentDocNode {
  type: string;
  attrs?: Record<string, string | number | boolean>;
  content?: Array<ContentDocNode | ContentTextNode>;
}

export type ContentDocument = ContentDocNode | string;

export interface ContentVersion {
  id: string;
  label: string;
  createdAt: string;
  author: string;
  summary: string;
  isCurrent: boolean;
  revision?: string;
  content: ContentDocument;
}

export interface ContentPageSummary {
  id: string;
  slug: string;
  title: string;
  icon: string;
  parentId: string | null;
  description: string;
  updatedLabel: string;
  contributorCount: number;
  tags: string[];
  searchText: string;
  updatedByLabel: string;
  updatedByPhotoUrl: string | null;
}

export interface ContentPage extends ContentPageSummary {
  cover: {
    accentClassName: string;
    eyebrow: string;
    gradientClassName: string;
  };
  versions: ContentVersion[];
}

export interface ContentSearchResult {
  id: string;
  slug: string;
  title: string;
  icon: string;
  excerpt: string;
  matchedVersionId: string;
}
