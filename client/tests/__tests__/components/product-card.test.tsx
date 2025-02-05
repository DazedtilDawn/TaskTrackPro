import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductCard from '@/components/product-card';
import type { SelectProduct } from '@db/schema';

// Mock the dependencies
jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: jest.fn(),
    }),
}));

jest.mock('wouter', () => ({
    useLocation: () => ['/test', jest.fn()],
}));

jest.mock('@/lib/queryClient', () => ({
    apiRequest: jest.fn(),
    queryClient: {
        invalidateQueries: jest.fn(),
    },
}));

// Create a mock product for testing
const mockProduct: SelectProduct = {
    id: 1,
    name: 'Test Product',
    description: 'A test product description',
    price: '19.99',
    imageUrl: '/test-image.jpg',
    aiAnalysis: null,
    sku: 'TEST123',
    quantity: 10,
    condition: 'used_good',
    brand: 'TestBrand',
    category: 'TestCategory',
    ebayPrice: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    listedAt: new Date(),
    soldAt: null,
    sold: false,
    ebayListingId: null,
    ebayListingStatus: null,
    ebayListingUrl: null,
    ebayListingData: null,
    ebayLastSync: null,
    ebayCategoryId: null,
};

describe('ProductCard', () => {
    it('renders basic product information correctly', () => {
        const handleEdit = jest.fn();
        render(
            <ProductCard
                product={mockProduct}
                onEdit={handleEdit}
                view="grid"
            />
        );

        // Check if basic product info is rendered
        expect(screen.getByText('Test Product')).toBeInTheDocument();
        expect(screen.getByText('$19.99')).toBeInTheDocument();
        expect(screen.getByText('TEST123')).toBeInTheDocument();
    });

    it('calls onEdit when edit button is clicked', async () => {
        const handleEdit = jest.fn();
        render(
            <ProductCard
                product={mockProduct}
                onEdit={handleEdit}
                view="grid"
            />
        );

        // Find and click the edit button
        const editButton = screen.getByRole('button', { name: /edit/i });
        await userEvent.click(editButton);

        // Verify the edit handler was called with the product
        expect(handleEdit).toHaveBeenCalledWith(mockProduct);
    });

    it('displays different views correctly', () => {
        const handleEdit = jest.fn();

        // Test grid view
        const { rerender } = render(
            <ProductCard
                product={mockProduct}
                onEdit={handleEdit}
                view="grid"
            />
        );

        // Verify grid view specific elements
        expect(screen.getByRole('article')).toHaveClass('grid-card');

        // Test list view
        rerender(
            <ProductCard
                product={mockProduct}
                onEdit={handleEdit}
                view="list"
            />
        );

        // Verify list view specific elements
        expect(screen.getByRole('article')).toHaveClass('list-card');
    });

    it('shows watchlist status correctly', () => {
        const handleEdit = jest.fn();
        render(
            <ProductCard
                product={mockProduct}
                onEdit={handleEdit}
                inWatchlist={true}
                view="grid"
            />
        );

        // Verify watchlist indicator is present
        expect(screen.getByRole('button', { name: /remove from watchlist/i })).toBeInTheDocument();
    });
}); 