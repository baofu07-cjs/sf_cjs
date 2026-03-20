import { NextResponse } from 'next/server';
import { getMQTTClient } from '@/lib/mqtt';

/**
 * MQTT 연결 상태 확인 API
 * GET /api/mqtt/status
 */

// 동적 렌더링 강제 (실시간 상태 조회)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = getMQTTClient();
    
    // 실제 MQTT 클라이언트 인스턴스 확인
    const mqttClient = client.getClientInstance();
    
    // 실제 연결 상태 확인 (가장 정확한 방법)
    const isClientConnected = mqttClient?.connected === true;
    
    // getConnected() 메서드로도 확인
    const isManagerConnected = client.getConnected();
    
    // 환경 변수 확인 (서버리스 환경에서 중요)
    const hasEnvVars = !!(
      process.env.MQTT_BROKER_URL &&
      process.env.MQTT_USERNAME &&
      process.env.MQTT_PASSWORD
    );
    
    // 연결 여부는 "실제 소켓 연결" 기준으로만 판단한다.
    // (환경 변수 존재 여부는 연결 가능 여부로 별도 제공)
    const connected = isClientConnected || isManagerConnected;

    // 디버깅을 위한 상세 정보 (개발 환경에서만)
    const debugInfo = process.env.NODE_ENV === 'development' ? {
      hasClient: !!client,
      hasMqttClient: !!mqttClient,
      clientConnected: mqttClient?.connected,
      internalConnected: (client as any).isConnected,
      isClientConnected,
      isManagerConnected,
      hasEnvVars,
    } : undefined;

    return NextResponse.json({
      connected,
      ready: hasEnvVars,
      timestamp: new Date().toISOString(),
      ...(debugInfo && { debug: debugInfo }),
    });
  } catch (error) {
    console.error('[API] MQTT 상태 확인 오류:', error);
    return NextResponse.json(
      { 
        connected: false,
        ready: false,
        error: '상태 확인에 실패했습니다.', 
        details: error instanceof Error ? error.message : '알 수 없는 오류' 
      },
      { status: 500 }
    );
  }
}
