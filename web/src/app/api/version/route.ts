import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 배포된 빌드/커밋 정보를 확인하기 위한 엔드포인트
 * - Vercel에서 "최신 커밋이 실제로 배포됐는지" 빠르게 점검할 때 사용
 */
export async function GET() {
  const env = process.env;

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    vercel: {
      env: env.VERCEL_ENV ?? null,
      git: {
        sha: env.VERCEL_GIT_COMMIT_SHA ?? null,
        ref: env.VERCEL_GIT_COMMIT_REF ?? null,
        message: env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
      },
      deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
      region: env.VERCEL_REGION ?? null,
    },
  });
}

