import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    // Basic auth check from cookies
    const scanUser = request.cookies.get('scan_user')?.value;
    if (scanUser !== 'raj@rmsint.net') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trackingId } = await request.json();

    if (!trackingId || typeof trackingId !== 'string' || trackingId.trim() === '') {
      return NextResponse.json({ error: 'Invalid tracking ID' }, { status: 400 });
    }

    const cleanTrackingId = trackingId.trim();

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || 'scanner_db');
    const collection = db.collection('scans');

    // Insert scan document
    const result = await collection.insertOne({
      trackingId: cleanTrackingId,
      scannedAt: new Date(),
      username: scanUser,
    });

    return NextResponse.json({
      success: true,
      message: 'Scan saved successfully',
      id: result.insertedId,
      trackingId: cleanTrackingId,
    });
  } catch (error: any) {
    console.error('Error saving scan to MongoDB:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
