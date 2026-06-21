jest.mock('fs');

const fs = require('fs');
const { fileToBase64 } = require('../utils/base64');

describe('fileToBase64', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when path is null', async () => {
    const result = await fileToBase64(null);
    expect(result).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    const result = await fileToBase64('/nonexistent/file.jpg');
    expect(result).toBeNull();
  });

  it('converts file to base64 data URI and deletes file', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('fake-image-data'));
    fs.unlink.mockImplementation((path, cb) => cb(null));

    const result = await fileToBase64('/tmp/test.png');
    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/test.png', expect.any(Function));
  });

  it('uses correct MIME types', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('data'));

    const tests = [
      { path: '/tmp/a.jpg', mime: 'image/jpeg' },
      { path: '/tmp/a.jpeg', mime: 'image/jpeg' },
      { path: '/tmp/a.png', mime: 'image/png' },
      { path: '/tmp/a.webp', mime: 'image/webp' },
      { path: '/tmp/a.gif', mime: 'image/gif' },
      { path: '/tmp/a.pdf', mime: 'application/pdf' },
      { path: '/tmp/a.svg', mime: 'image/svg+xml' },
    ];

    for (const t of tests) {
      fs.unlink.mockClear();
      const result = await fileToBase64(t.path);
      expect(result).toContain(t.mime);
    }
  });

  it('handles fs.unlink error gracefully', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(Buffer.from('data'));
    fs.unlink.mockImplementation((path, cb) => cb(new Error('permission denied')));

    const result = await fileToBase64('/tmp/test.jpg');
    expect(result).not.toBeNull();
    expect(result).toContain('base64');
  });
});
