import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-northeast-2',
});

const BUCKET = process.env.S3_BUCKET || 'eureka-flows-local';

export const getObject = async (key: string) => {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return s3.send(cmd);
};

export const putObject = async (key: string, body: Buffer | string, contentType: string) => {
    const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType });
    return s3.send(cmd);
};

export { BUCKET, s3 };
