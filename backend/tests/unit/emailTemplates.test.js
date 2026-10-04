const { emailTemplates } = require('../../src/services/notificationService');

// Templates interpolate user-typed text into HTML that the school's own
// address then sends to parents. Markup must arrive as text.
describe('email templates escape user input', () => {
  it('escapes an announcement but keeps its line breaks', () => {
    const html = emailTemplates.announcement({
      title: '<b>Fees</b>',
      body: 'First line\n<script>alert(1)</script> <a href="http://evil">pay here</a>',
      senderName: 'Mr <i>Okafor</i>',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="http://evil">');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('First line<br>');
    expect(html).toContain('Mr &lt;i&gt;Okafor&lt;/i&gt;');
  });

  it('escapes names and passwords in the welcome email', () => {
    const html = emailTemplates.welcome({
      firstName: '<img src=x onerror=1>',
      email: 'a@b.com',
      password: 'p<&>w',
      role: 'Parent',
      loginUrl: 'https://school.example/login',
    });

    expect(html).not.toContain('<img');
    expect(html).toContain('p&lt;&amp;&gt;w');
  });

  it('leaves numbers and dates alone', () => {
    const html = emailTemplates.paymentReceipt({
      studentName: 'Ada',
      receiptNumber: 'RCP-26-000001',
      amount: 5000,
      term: 'First Term',
      academicYear: '2026/2027',
      date: new Date('2026-10-03'),
      method: 'Cash',
      feeTitle: 'Tuition',
      outstanding: 0,
    });

    expect(html).toContain('₦5,000');
  });
});
