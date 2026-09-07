'use client';

import Heading from '@tiptap/extension-heading';
import { Plugin } from '@tiptap/pm/state';

import { createUniqueHeadingAnchor } from './content-heading-anchors';

export const ContentHeadingExtension = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      anchorId: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
        renderHTML: (attributes) => {
          if (!attributes.anchorId) {
            return {};
          }

          return { id: attributes.anchorId };
        }
      }
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const transaction = newState.tr;
          const usedAnchors = new Set<string>();
          let hasChanges = false;

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) {
              return;
            }

            const nextAnchorId = createUniqueHeadingAnchor(
              typeof node.attrs.anchorId === 'string' ? node.attrs.anchorId : null,
              node.textContent,
              usedAnchors
            );

            if (node.attrs.anchorId === nextAnchorId) {
              return;
            }

            transaction.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              anchorId: nextAnchorId
            });
            hasChanges = true;
          });

          return hasChanges ? transaction : null;
        }
      })
    ];
  }
}).configure({
  levels: [1, 2, 3, 4]
});
