import { NextRequest, NextResponse } from 'next/server';

import { buildProxyHeaders } from '../../auth/proxy-headers';

import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const API_VERSION = 'v1';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets/${id}`;
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
    console.error('Get issue proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to fetch issue' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets/${id}`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'PATCH',
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
    console.error('Update issue proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update issue' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = `${getVersionedApiBaseUrl(API_VERSION)}/tickets/${id}`;
    const headers = buildProxyHeaders(req, {
      includeAuthorization: true,
      includeTenant: true
    });

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
      credentials: 'include'
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Delete issue proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete issue' },
      { status: 500 }
    );
  }
}
