describe('Inventory Management', () => {
    beforeEach(() => {
        // Reset application state and login
        cy.request('POST', `${Cypress.env('apiUrl')}/auth/login`, {
            username: Cypress.env('testUsername'),
            password: Cypress.env('testPassword'),
        });

        cy.visit('/inventory');
    });

    it('displays the inventory page with products', () => {
        // Check header and navigation
        cy.get('header').should('be.visible');
        cy.contains('Inventory').should('be.visible');

        // Check product list
        cy.get('[data-testid="product-grid"]').should('exist');
        cy.get('[data-testid="product-card"]').should('have.length.at.least', 1);
    });

    it('can add a new product', () => {
        // Click add product button
        cy.contains('button', 'Add Product').click();

        // Fill out the form
        cy.get('form').within(() => {
            cy.get('input[name="name"]').type('Test Product');
            cy.get('input[name="sku"]').type('TEST123');
            cy.get('input[name="price"]').type('29.99');
            cy.get('textarea[name="description"]').type('A test product description');
            cy.get('select[name="condition"]').select('new');
            cy.get('input[name="brand"]').type('TestBrand');
            cy.get('input[name="category"]').type('TestCategory');
            cy.get('input[name="quantity"]').type('1');

            cy.contains('button', 'Save').click();
        });

        // Verify product was added
        cy.contains('Test Product').should('be.visible');
        cy.contains('$29.99').should('be.visible');
    });

    it('can edit an existing product', () => {
        // Find and click edit on first product
        cy.get('[data-testid="product-card"]')
            .first()
            .find('button[aria-label="Edit"]')
            .click();

        // Update the product
        cy.get('form').within(() => {
            cy.get('input[name="name"]').clear().type('Updated Product');
            cy.get('input[name="price"]').clear().type('39.99');

            cy.contains('button', 'Save').click();
        });

        // Verify changes
        cy.contains('Updated Product').should('be.visible');
        cy.contains('$39.99').should('be.visible');
    });

    it('can delete a product', () => {
        // Store the name of the first product
        let productName: string;
        cy.get('[data-testid="product-card"]')
            .first()
            .find('[data-testid="product-name"]')
            .invoke('text')
            .then((text) => {
                productName = text;
            });

        // Delete the product
        cy.get('[data-testid="product-card"]')
            .first()
            .find('button[aria-label="Delete"]')
            .click();

        // Confirm deletion
        cy.contains('button', 'Yes, delete').click();

        // Verify product is removed
        cy.contains(productName).should('not.exist');
    });

    it('can filter and search products', () => {
        // Test search functionality
        cy.get('input[placeholder*="Search"]').type('Test');
        cy.get('[data-testid="product-card"]').should('have.length.at.least', 1);
        cy.get('[data-testid="product-card"]').each(($card) => {
            cy.wrap($card).should('contain.text', 'Test');
        });

        // Test view toggle
        cy.get('button[aria-label="List view"]').click();
        cy.get('[data-testid="product-list"]').should('be.visible');

        cy.get('button[aria-label="Grid view"]').click();
        cy.get('[data-testid="product-grid"]').should('be.visible');
    });

    it('handles pagination correctly', () => {
        // Assuming we have more than one page of products
        cy.get('[data-testid="pagination"]').should('exist');

        // Go to next page
        cy.get('button[aria-label="Next page"]').click();
        cy.url().should('include', 'page=2');

        // Go back to first page
        cy.get('button[aria-label="Previous page"]').click();
        cy.url().should('include', 'page=1');
    });

    it('shows correct product details', () => {
        // Click on a product to view details
        cy.get('[data-testid="product-card"]')
            .first()
            .click();

        // Verify product details page
        cy.url().should('match', /\/products\/\d+/);
        cy.get('[data-testid="product-details"]').within(() => {
            cy.get('[data-testid="product-name"]').should('be.visible');
            cy.get('[data-testid="product-price"]').should('be.visible');
            cy.get('[data-testid="product-description"]').should('be.visible');
            cy.get('[data-testid="product-sku"]').should('be.visible');
        });
    });
}); 