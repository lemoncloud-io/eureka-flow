/**
 * Maps a block's current port/config label (as stored on the server today) to its
 * i18n key. Used by the label→key migration to convert port/config labels in one pass.
 *
 * Keys here MUST match the seeded translations in apps/web/public/locales/{lng}/blocks.json.
 * Both Korean and English label variants map to the same key (server data is mixed-language).
 */
export const FIELD_LABEL_TO_KEY: Record<string, string> = {
    // --- ports & shared fields ---
    텍스트: 'text',
    이미지: 'image',
    입력: 'input',
    출력: 'output',
    프롬프트: 'prompt',
    스키마: 'schema',
    '시스템 프롬프트': 'system_prompt',
    'System Prompt': 'system_prompt',
    '이미지 1': 'image_1',
    '이미지 2': 'image_2',
    '이미지 3': 'image_3',
    '이미지 4': 'image_4',
    '이미지 5': 'image_5',
    결과: 'result',
    오류: 'error',
    'AI 코드': 'ai_code',
    'JSON 스키마': 'json_schema',
    템플릿: 'template',
    '1번째 입력': 'input_1',
    '2번째 입력': 'input_2',
    '3번째 입력': 'input_3',
    '4번째 입력': 'input_4',
    '5번째 입력': 'input_5',
    '생성된 텍스트': 'generated_text',
    HTML: 'html',
    '제품 정보': 'product_info',
    '제품 ID': 'product_id',

    // --- config field labels ---
    '가로 세로 비율': 'aspect_ratio',
    '최대 너비': 'max_width',
    '처리 우회': 'bypass',
    '지연 (ms)': 'delay_ms',
    '생성 모델': 'model',
    'Pro Mode': 'pro_mode',
    Temperature: 'temperature',
    'Top P': 'top_p',
    'Top K': 'top_k',
    '이미지 크기': 'image_size',
    '1번째 입력의 텍스트 이름': 'text_name_1',
    '2번째 입력의 텍스트 이름': 'text_name_2',
    '3번째 입력의 텍스트 이름': 'text_name_3',
    '4번째 입력의 텍스트 이름': 'text_name_4',
    '5번째 입력의 텍스트 이름': 'text_name_5',
    'JSON Parameter Names': 'json_parameter_names',
    '1번째 입력의 JSON 이름': 'json_name_1',
    '2번째 입력의 JSON 이름': 'json_name_2',
    '3번째 입력의 JSON 이름': 'json_name_3',
    '4번째 입력의 JSON 이름': 'json_name_4',
    '5번째 입력의 JSON 이름': 'json_name_5',
    '프로젝트 ID (projectId)': 'project_id',
    '타이틀 (title)': 'title',
    '버전 (version)': 'version',
    설명: 'description',
    '설명 (description)': 'description',
    '자동 배포': 'auto_deploy',
    접두사: 'prefix',

    // --- agent-codex ---
    요청사항: 'request',
    처리결과: 'result',
};

const KEY_PATTERN = /^[a-z0-9_]+$/;

/** Key for a field label, or null to leave it unchanged (already a key, or unknown/unmapped). */
export const resolveFieldKey = (label: string): string | null => {
    if (!label || KEY_PATTERN.test(label)) return null;
    return FIELD_LABEL_TO_KEY[label] ?? null;
};
