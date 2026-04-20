import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/http';
import {
  buildExportFilename,
  buildThreadExportData,
  renderThreadJson,
  renderThreadPrintHtml
} from '@/lib/services/threadExport';
import { getThread } from '@/lib/services/threadService';

type ExportFormat = 'json' | 'pdf';

function getExportFormat(value: string | null): ExportFormat | null {
  if (value === 'json' || value === 'pdf') {
    return value;
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  const format = getExportFormat(new URL(request.url).searchParams.get('format'));
  if (!format) {
    return errorResponse(
      { code: 'invalid_request', message: 'Invalid export format. Use json or pdf.' },
      400
    );
  }

  const { threadId } = await params;
  const thread = await getThread(user.id, threadId);
  if (!thread) {
    return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
  }

  const exportData = buildThreadExportData(thread);

  if (format === 'json') {
    return new Response(renderThreadJson(exportData), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildExportFilename(exportData, format)}"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  return new Response(renderThreadPrintHtml(exportData), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${buildExportFilename(exportData, format)}"`,
      'Cache-Control': 'no-store'
    }
  });
}