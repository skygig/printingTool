import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    // Basic auth check from cookies
    const scanUser = request.cookies.get('scan_user')?.value;
    if (scanUser !== 'raj@rmsint.net') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { image } = await request.json();

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid or missing image data' }, { status: 400 });
    }

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || 'scanner_db');
    const collection = db.collection('shipping_captures');

    // Insert shipping capture document
    const result = await collection.insertOne({
      image: image,
      capturedAt: new Date(),
      username: scanUser,
    });

    return NextResponse.json({
      success: true,
      message: 'Shipping capture saved successfully',
      id: result.insertedId,
    });
  } catch (error: any) {
    console.error('Error saving shipping capture to MongoDB:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
