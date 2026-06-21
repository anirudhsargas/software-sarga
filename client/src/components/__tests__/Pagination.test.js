import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../Pagination';

vi.mock('../Pagination.css', () => ({}));

describe('Pagination component', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 5,
    onPageChange: vi.fn(),
  };

  it('renders navigation buttons', () => {
    render(<Pagination {...defaultProps} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('disables previous on first page', () => {
    render(<Pagination {...defaultProps} currentPage={1} />);
    const prevButton = screen.getByLabelText(/previous/i);
    expect(prevButton.closest('button')).toBeDisabled();
  });

  it('disables next on last page', () => {
    render(<Pagination {...defaultProps} currentPage={5} />);
    const nextButton = screen.getByLabelText(/next/i);
    expect(nextButton.closest('button')).toBeDisabled();
  });

  it('calls onPageChange when clicking a page', () => {
    const onPageChange = vi.fn();
    render(<Pagination {...defaultProps} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByText('3'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('handles single page gracefully', () => {
    render(<Pagination {...defaultProps} totalPages={1} />);
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('renders with className prop', () => {
    const { container } = render(
      <Pagination {...defaultProps} className="custom-pagination" />
    );
    expect(container.querySelector('.custom-pagination')).toBeInTheDocument();
  });
});
