import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/pages/${id}/comments`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('List content comments proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to list content comments' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      bodyMarkdown: string;
      parentCommentId?: number;
    };
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/pages/${id}/comments`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Create content comment proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create content comment' },
      { status: 500 }
    );
  }
}
