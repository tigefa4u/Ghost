# Ghost Product Design Principles

## Don’t make me think

Create self-explanatory, intuitive design. Publishers should instantly understand how to use Ghost without having to think.

**Checklist**

1. It should be easy to figure out what’s going on on the screen, what’s the most important thing, what’s clickable just by looking at it.
2. There should be as few things on the screen as possible. Remove, hide, reposition everything that’s not essential.
3. In a sequential flow, there should be one clear next step and the primary button should be at the same position in the same flow.
4. Error messages must be extremely clear and always provide guidance on how to fix the error. No internal, ambiguous terminology. Assume people know nothing about the internal workings of the system.
5. Don’t rely on explaining things. Descriptions, tooltips, questions mark icons are never the answer: better design is.
6. Do as much as you can to help *setting up* Ghost, especially for beginners! People come to Ghost to publish their content and grow an audience, not to spend weeks figuring out how the product works.
7. Use color very sparingly to draw attention to actions or errors, not to fix hierarchy problems.
8. Optimize for eye movement.

## Details matter

Craft and quality is often represented in attention to details. Ghost is the primary tool for publishers who use it all day every day. Everything we do should be carefully crafted, inspiring and beautiful.

**Checklist**

1. It’s worth repeating: details matter in both how something works and how it looks.
2. Don’t just show the data, we’re not phpmyadmin.
3. Everything should work in dark mode, light mode, on mobile, tablet, desktop.
4. Provide keyboard shortcuts for common actions. Shortcuts should be stored in the `title` property of the component.
5. Perfect typography is key for a publishing tool. We lose face if our typography sucks.
6. Make Ghost feel smooth and snappy. Use animation only when it doesn’t sacrifice speed and remember: a loading indicator is not a fix for speed problems.
7. Every interactive element should have a hover state.

## Have an opinion

We build the software *we* think is best, and then we measure to see if we're right. If data or feedback indicates we're wrong, then we try again with what *we* think is best from what we've now learned, and measure again. If something doesn’t feel right, work on it until it does.

---

# Visual language

**Yes:** timeless, minimal, modern, calm, editorial, detailed, human

**No:** brutalist (readymag), gimmicky (gumroad), generic (yet another SaaS), technical (github), cheap (convertkit)

---

# Common traps to avoid

This living list below outlines common design mistakes that require extra attention:

1. No modals on top of modals.
2. Follow basic visual design rules like alignment, balance and line-height.
3. No technical error messages. Ever!
4. All user facing numbers must be formatted. Use existing Shade functions for it.
5. All user facing dates must be formatted to `DD MMM YYYY` (e.g. `12 Jun 2025`) format. Use existing Shade functions for it.
6. New global reusable components should be part of Shade.