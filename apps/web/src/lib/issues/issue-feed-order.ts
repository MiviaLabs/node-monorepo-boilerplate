import type { IssueActivity, IssueComment } from '~/types/issue.types';

function compareNewestFirst(
  left: { createdAt: string | Date; id: number | string },
  right: { createdAt: string | Date; id: number | string }
) {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return String(right.id).localeCompare(String(left.id), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

export function orderIssueCommentsDesc(comments: IssueComment[]): IssueComment[] {
  return [...comments].sort(compareNewestFirst);
}

export function orderIssueActivityDesc(activity: IssueActivity[]): IssueActivity[] {
  return [...activity].sort(compareNewestFirst);
}
