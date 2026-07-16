import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

const SHARED_API_TOKEN = process.env.SHARED_API_TOKEN || 'd4b8e21a-7b3e-4d56-bc98-fa39e6a39281';

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${SHARED_API_TOKEN}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || 'scanner_db');
    const collection = db.collection('scans');

    // Fetch scans in the last 5 minutes (or standard limit)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const scans = await collection
      .find({ scannedAt: { $gte: fiveMinsAgo } })
      .sort({ scannedAt: -1 })
      .toArray();

    const formatted = scans.map(doc => ({
      id: doc._id.toString(),
      trackingId: doc.trackingId,
      scannedAt: doc.scannedAt,
      username: doc.username || 'unknown'
    }));

    return NextResponse.json({ success: true, scans: formatted });
  } catch (error: any) {
    console.error('Error fetching scans from MongoDB:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}

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
