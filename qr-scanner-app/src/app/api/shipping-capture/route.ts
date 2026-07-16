import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

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
    const collection = db.collection('shipping_captures');

    const captures = await collection.find({}).sort({ capturedAt: -1 }).toArray();

    const formatted = captures.map(doc => ({
      id: doc._id.toString(),
      image: doc.image,
      capturedAt: doc.capturedAt,
      username: doc.username || 'unknown'
    }));

    return NextResponse.json({ success: true, captures: formatted });
  } catch (error: any) {
    console.error('Error fetching captures from MongoDB:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if proxy request
    const isProxy = request.headers.get('authorization') !== null;
    if (isProxy) {
      if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const body = await request.json();
      const { action, image_ids } = body;

      if (action === 'delete') {
        if (!image_ids || !Array.isArray(image_ids)) {
          return NextResponse.json({ error: 'Missing image_ids' }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB || 'scanner_db');
        const collection = db.collection('shipping_captures');

        const objectIds = image_ids.map(id => new ObjectId(id));
        await collection.deleteMany({ _id: { $in: objectIds } });

        return NextResponse.json({ success: true, message: `Successfully deleted ${image_ids.length} images` });
      }

      return NextResponse.json({ error: 'Invalid proxy action' }, { status: 400 });
    }

    // Normal save capture (Scanner App UI)
    const scanUser = request.cookies.get('scan_user')?.value;
    if (scanUser !== 'raj@rmsint.net') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { image } = await request.json();

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid or missing image data' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB || 'scanner_db');
    const collection = db.collection('shipping_captures');

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
    console.error('Error handling shipping capture:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
